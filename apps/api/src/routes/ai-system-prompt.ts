import { eq, asc } from 'drizzle-orm';
import { db } from '../db.js';
import { types, fields } from '../schema.js';

/**
 * Builds a system prompt describing the current app schema.
 * Shared by the chat endpoint and the AI generation endpoints.
 */
export async function buildSchemaContext(appId: string): Promise<string> {
  const appTypes = await db
    .select()
    .from(types)
    .where(eq(types.appId, appId))
    .orderBy(asc(types.position));

  const typeFieldsMap: Record<string, (typeof fields.$inferSelect)[]> = {};
  for (const type of appTypes) {
    const typeFields = await db
      .select()
      .from(fields)
      .where(eq(fields.typeId, type.id))
      .orderBy(asc(fields.position));
    typeFieldsMap[type.id] = typeFields;
  }

  if (appTypes.length === 0) {
    return 'This app currently has no types defined. It is a blank slate.';
  }

  let desc = 'Current app schema:\n';
  for (const type of appTypes) {
    desc += `\nType: "${type.name}" (id: ${type.id})`;
    if (type.description) desc += ` — ${type.description}`;
    desc += '\n';

    const tf = typeFieldsMap[type.id] || [];
    if (tf.length === 0) {
      desc += '  Fields: none\n';
    } else {
      for (const f of tf) {
        desc += `  - "${f.name}" (id: ${f.id}, type: ${f.type}`;
        if (f.required) desc += ', required';
        if (f.type === 'relation') {
          const relatedTypeId = (f.config as Record<string, unknown>)
            ?.relatedTypeId as string | undefined;
          const relatedType = appTypes.find((t) => t.id === relatedTypeId);
          if (relatedType)
            desc += `, relates to "${relatedType.name}"`;
        }
        if (f.type === 'select' || f.type === 'multi_select') {
          const options = (f.config as Record<string, unknown>)?.options as
            | string[]
            | undefined;
          if (options?.length)
            desc += `, options: [${options.join(', ')}]`;
        }
        desc += ')\n';
      }
    }
  }

  return desc;
}

/**
 * Full system prompt for the general-purpose AI chat endpoint.
 */
export async function buildSystemPrompt(appId: string): Promise<string> {
  const schemaContext = await buildSchemaContext(appId);

  return `You are an AI assistant that helps users design data models and set up automations for their applications. You work within an app-building platform.

${schemaContext}

Your capabilities:
- Create, update, and delete types (data models like Contact, Company, Deal)
- Create, update, and delete fields on types (text, number, boolean, date, select, multi_select, url, email, relation)
- Create records (rows of data) in types
- List records in a type
- Create automations — Python scripts that run automatically when records are created, updated, or deleted
- List existing automations

Automation guidelines:
- Automations are Python scripts that run in a secure sandbox with pandas available.
- When the user asks to "automate", "trigger", or "when X happens do Y", use create_automation.
- The code must reference field IDs (UUIDs from the schema above), NOT field names.
- Available in the sandbox: ctx dict (event data), field_map (ID↔name mapping), pd (pandas), and helpers: create_record(type_id, data), update_record(type_id, record_id, data), delete_record(type_id, record_id), log(msg), warn(msg), error(msg).
- ctx["record"] is a dict of {field_id: value} for the triggering record.
- ctx["previous_record"] is available only for record_updated triggers.
- Write clean, readable Python. Add comments explaining the logic.
- Always log key actions with log() so users can debug from run history.

General guidelines:
- When the user asks you to create a data model (e.g. "build me a CRM"), create types and their fields systematically.
- For relation fields, you MUST first create both types, then add the relation field referencing the target type's ID from the tool result.
- Use appropriate field types: email fields for emails, url for URLs, select for status/category dropdowns, boolean for yes/no flags, date for dates, number for quantities/amounts.
- Always give types and fields clear, descriptive names.
- Set fields as required when they represent essential data (e.g., a Contact's name).
- For select fields, provide sensible default options.
- After making changes, briefly summarize what you created so the user knows what happened.
- Be conversational but efficient. Execute tools to accomplish the user's request.`;
}
