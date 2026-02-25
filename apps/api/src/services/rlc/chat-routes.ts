import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '../../db.js';
import { env } from '../../env.js';
import { sql } from 'drizzle-orm';

export const rlcChatRoutes = new Hono();

// --- Tool definitions ---

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_documents',
    description:
      'Full-text search across the document corpus. Returns matching documents with relevance-ranked snippets. Use this to find documents by keywords, phrases, or topics. Try different search terms if initial results are not relevant.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query (keywords or phrases). PostgreSQL full-text search with English stemming.',
        },
        file_type: {
          type: 'string',
          description: 'Optional file type filter (e.g., "pdf", "docx", "xlsx", "msg", "eml", "txt", "csv").',
        },
        directory: {
          type: 'string',
          description: 'Optional directory path prefix to narrow search scope.',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (default 10, max 50).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_document',
    description:
      'Retrieve the full text content and metadata of a specific document by its ID. Use this after searching to read the full content of a promising result.',
    input_schema: {
      type: 'object' as const,
      properties: {
        document_id: {
          type: 'string',
          description: 'The UUID of the document to retrieve.',
        },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'list_directories',
    description:
      'List all directories in the document corpus with document counts. Use this to understand the folder structure and narrow searches to specific areas.',
    input_schema: {
      type: 'object' as const,
      properties: {
        prefix: {
          type: 'string',
          description: 'Optional path prefix to filter directories.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_corpus_stats',
    description:
      'Get statistics about the document corpus including total documents, indexed count, word count, and file type breakdown.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

// --- System prompt ---

const SYSTEM_PROMPT = `You are a document research assistant for the RL Controls / Hitachi Rail collaboration project. You have access to a corpus of approximately 12,500 documents (45 million words) from a shared Dropbox folder. The documents include PDFs, Word documents, Excel spreadsheets, emails (MSG/EML), and text files related to rail infrastructure engineering.

Your job is to help users find specific documents, answer questions about the document corpus, and provide information extracted from the documents.

When searching:
- Start with broad keyword searches, then refine with more specific terms
- Try multiple search strategies if the first attempt doesn't yield good results
- Use directory filtering to narrow scope when you know the relevant area
- Consider synonyms and alternative phrasings
- For emails, search for subject lines, sender names, or key phrases
- You can retrieve full document text to read and analyze content in detail

When presenting results:
- Cite specific documents by filename and path
- Quote relevant passages when answering questions
- Note the file type, date, and location for context
- If results are ambiguous, present multiple options and ask for clarification

The Dropbox folder structure starts with "/HITACHI RAIL COLLABORATION at RLC/" and contains engineering, project management, and correspondence directories.`;

// --- Tool execution ---

async function executeToolCall(toolName: string, input: Record<string, any>): Promise<any> {
  switch (toolName) {
    case 'search_documents':
      return executeSearch(input);
    case 'get_document':
      return executeGetDocument(input);
    case 'list_directories':
      return executeListDirectories(input);
    case 'get_corpus_stats':
      return executeGetStats();
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

async function executeSearch(input: Record<string, any>) {
  const query = input.query as string;
  const fileType = input.file_type as string | undefined;
  const directory = input.directory as string | undefined;
  const limit = Math.min(input.limit ?? 10, 50);

  const typeFilter = fileType ? sql` AND file_type = ${fileType}` : sql``;
  const dirFilter = directory ? sql` AND directory_path LIKE ${directory + '%'}` : sql``;

  const [results, countResult] = await Promise.all([
    db.execute(sql`
      SELECT
        id, file_name, file_type, dropbox_path, directory_path,
        word_count, page_count, dropbox_modified,
        ts_rank(text_search, plainto_tsquery('english', ${query})) AS rank,
        ts_headline(
          'english',
          coalesce(extracted_text, ''),
          plainto_tsquery('english', ${query}),
          'StartSel=**, StopSel=**, MaxWords=50, MinWords=25, MaxFragments=2, FragmentDelimiter= ... '
        ) AS snippet
      FROM rlc_documents
      WHERE text_search @@ plainto_tsquery('english', ${query})
        AND status = 'completed'
        ${typeFilter}
        ${dirFilter}
      ORDER BY rank DESC
      LIMIT ${limit}
    `),
    db.execute(sql`
      SELECT count(*)::int AS total
      FROM rlc_documents
      WHERE text_search @@ plainto_tsquery('english', ${query})
        AND status = 'completed'
        ${typeFilter}
        ${dirFilter}
    `),
  ]);

  return {
    results: (results as any[]).map((r) => ({
      id: r.id,
      fileName: r.file_name,
      fileType: r.file_type,
      dropboxPath: r.dropbox_path,
      directoryPath: r.directory_path,
      wordCount: r.word_count,
      pageCount: r.page_count,
      dropboxModified: r.dropbox_modified,
      rank: parseFloat(r.rank),
      snippet: r.snippet,
    })),
    totalMatches: (countResult as any[])[0]?.total ?? 0,
    query,
  };
}

async function executeGetDocument(input: Record<string, any>) {
  const id = input.document_id as string;

  const rows = await db.execute(sql`
    SELECT
      id, file_name, file_type, dropbox_path, directory_path,
      word_count, page_count, dropbox_modified, status,
      extracted_text, text_preview
    FROM rlc_documents
    WHERE id = ${id}
    LIMIT 1
  `);

  const doc = (rows as any[])[0];
  if (!doc) return { error: 'Document not found' };

  // Truncate very long text to avoid blowing up context window
  const text = doc.extracted_text || '';
  const truncated =
    text.length > 30000 ? text.slice(0, 30000) + '\n\n[...truncated, document continues...]' : text;

  return {
    id: doc.id,
    fileName: doc.file_name,
    fileType: doc.file_type,
    dropboxPath: doc.dropbox_path,
    directoryPath: doc.directory_path,
    wordCount: doc.word_count,
    pageCount: doc.page_count,
    dropboxModified: doc.dropbox_modified,
    extractedText: truncated,
  };
}

async function executeListDirectories(input: Record<string, any>) {
  const prefix = input.prefix as string | undefined;
  const prefixFilter = prefix ? sql` AND directory_path LIKE ${prefix + '%'}` : sql``;

  const rows = await db.execute(sql`
    SELECT
      directory_path,
      count(*)::int AS doc_count
    FROM rlc_documents
    WHERE status = 'completed' AND directory_path IS NOT NULL
      ${prefixFilter}
    GROUP BY directory_path
    ORDER BY directory_path
  `);

  return {
    directories: (rows as any[]).map((r) => ({
      path: r.directory_path,
      docCount: r.doc_count,
    })),
  };
}

async function executeGetStats() {
  const [mainStats, typeBreakdown] = await Promise.all([
    db.execute(sql`
      SELECT
        count(*)::int AS total_documents,
        count(*) FILTER (WHERE status = 'completed')::int AS indexed_documents,
        coalesce(sum(word_count) FILTER (WHERE status = 'completed'), 0)::bigint AS total_words
      FROM rlc_documents
    `),
    db.execute(sql`
      SELECT file_type, count(*)::int AS count
      FROM rlc_documents WHERE status = 'completed'
      GROUP BY file_type ORDER BY count DESC
    `),
  ]);

  const stats = (mainStats as any[])[0];
  return {
    totalDocuments: stats.total_documents,
    indexedDocuments: stats.indexed_documents,
    totalWords: Number(stats.total_words),
    typeBreakdown: (typeBreakdown as any[]).map((r) => ({
      fileType: r.file_type,
      count: r.count,
    })),
  };
}

// --- Chat endpoint ---

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.union([z.string(), z.array(z.any())]),
      }),
    )
    .min(1),
});

rlcChatRoutes.post('/chat', async (c) => {
  const body = await c.req.json();
  const { messages } = chatSchema.parse(body);

  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  return streamSSE(c, async (stream) => {
    let conversationMessages = [...messages] as Anthropic.MessageParam[];
    let continueLoop = true;

    while (continueLoop) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: conversationMessages,
      });

      // Check if the response contains tool use
      const toolUseBlocks = response.content.filter((block) => block.type === 'tool_use');

      if (toolUseBlocks.length > 0) {
        // Stream only tool call events during loop (skip intermediate text to avoid duplication)
        for (const block of response.content) {
          if (block.type === 'tool_use') {
            await stream.writeSSE({
              event: 'tool_call',
              data: JSON.stringify({ tool: block.name, input: block.input }),
            });
          }
        }

        // Execute tool calls
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of toolUseBlocks) {
          if (block.type === 'tool_use') {
            const result = await executeToolCall(block.name, block.input as Record<string, any>);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          }
        }

        // Add assistant response and tool results to conversation
        conversationMessages.push({ role: 'assistant', content: response.content });
        conversationMessages.push({ role: 'user', content: toolResults });
      } else {
        // Final response — combine all text blocks into a single event
        const text = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('');
        if (text) {
          await stream.writeSSE({ event: 'text', data: JSON.stringify({ text }) });
        }
        continueLoop = false;
      }

      // Safety: stop after too many iterations (each tool round = 2 messages)
      if (conversationMessages.length > 40) {
        await stream.writeSSE({
          event: 'text',
          data: JSON.stringify({ text: '\n\n*I\'ve reached the maximum number of search iterations. Here\'s what I found so far based on the searches above.*' }),
        });
        continueLoop = false;
      }
    }

    await stream.writeSSE({ event: 'done', data: '{}' });
  });
});
