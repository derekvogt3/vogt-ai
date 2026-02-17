import type { RegistryEntry } from './types';
import { Container } from './components/container';
import { Heading } from './components/heading';
import { TextBlock } from './components/text-block';
import { ButtonComponent } from './components/button';
import { DataTable } from './components/data-table';
import { RecordForm } from './components/record-form';

export const registry: Record<string, RegistryEntry> = {
  Container: {
    component: Container,
    label: 'Container',
    category: 'layout',
    description: 'Layout wrapper with padding and max width',
    acceptsChildren: true,
    acceptsDataBinding: false,
    propsSchema: {
      padding: {
        type: 'enum',
        description: 'Inner padding',
        default: 'md',
        enumValues: ['none', 'sm', 'md', 'lg'],
      },
      maxWidth: {
        type: 'enum',
        description: 'Maximum width',
        default: '5xl',
        enumValues: ['sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', 'full'],
      },
    },
  },

  Heading: {
    component: Heading,
    label: 'Heading',
    category: 'display',
    description: 'Title text (h1–h4)',
    acceptsChildren: false,
    acceptsDataBinding: false,
    propsSchema: {
      text: {
        type: 'string',
        description: 'Heading text',
        required: true,
        default: 'Heading',
      },
      level: {
        type: 'enum',
        description: 'Heading level',
        default: '2',
        enumValues: ['1', '2', '3', '4'],
      },
    },
  },

  Text: {
    component: TextBlock,
    label: 'Text',
    category: 'display',
    description: 'Static text paragraph',
    acceptsChildren: false,
    acceptsDataBinding: false,
    propsSchema: {
      content: {
        type: 'string',
        description: 'Text content',
        required: true,
        default: 'Enter text here...',
      },
    },
  },

  Button: {
    component: ButtonComponent,
    label: 'Button',
    category: 'display',
    description: 'Navigation link or action button',
    acceptsChildren: false,
    acceptsDataBinding: false,
    propsSchema: {
      label: {
        type: 'string',
        description: 'Button text',
        required: true,
        default: 'Click me',
      },
      href: {
        type: 'string',
        description: 'Link URL (relative or absolute)',
      },
      variant: {
        type: 'enum',
        description: 'Visual style',
        default: 'primary',
        enumValues: ['primary', 'secondary', 'danger'],
      },
    },
  },

  DataTable: {
    component: DataTable,
    label: 'Data Table',
    category: 'data',
    description: 'Table displaying records with pagination',
    acceptsChildren: false,
    acceptsDataBinding: true,
    propsSchema: {
      title: {
        type: 'string',
        description: 'Table title',
      },
      columns: {
        type: 'fieldId[]',
        description: 'Fields to show as columns (all if empty)',
      },
      showPagination: {
        type: 'boolean',
        description: 'Show pagination controls',
        default: true,
      },
    },
  },

  RecordForm: {
    component: RecordForm,
    label: 'Record Form',
    category: 'input',
    description: 'Form to create new records',
    acceptsChildren: false,
    acceptsDataBinding: true,
    propsSchema: {
      title: {
        type: 'string',
        description: 'Form title',
        default: 'New Record',
      },
      fields: {
        type: 'fieldId[]',
        description: 'Fields to include in form (all if empty)',
      },
      submitLabel: {
        type: 'string',
        description: 'Submit button text',
        default: 'Submit',
      },
      showTitle: {
        type: 'boolean',
        description: 'Show form title',
        default: true,
      },
    },
  },
};

export function getRegistryEntry(type: string): RegistryEntry | undefined {
  return registry[type];
}

export function getRegistryEntries(): [string, RegistryEntry][] {
  return Object.entries(registry);
}
