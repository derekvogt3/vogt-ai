import type { AppRecord, Field } from '../api/apps-client';

// --- Component Config (stored as JSONB in DB) ---

export type ComponentNode = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children?: ComponentNode[];
  dataBinding?: DataBinding;
};

export type DataBinding = {
  typeId: string;
  filters?: { fieldId: string; operator: string; value: unknown }[];
  sort?: { fieldId: string; direction: 'asc' | 'desc' };
  limit?: number;
  recordParam?: string;
};

export type PageConfig = {
  root: ComponentNode;
};

// --- Data Context (provided by DataProvider to data-bound components) ---

export type DataContext = {
  records: AppRecord[];
  fields: Field[];
  total: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  error: string | null;
  createRecord: (data: Record<string, unknown>) => Promise<void>;
  updateRecord: (id: string, data: Record<string, unknown>) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  setPage: (page: number) => void;
  resolvedRelations: Record<string, string>;
};

// --- Registry Entry ---

export type PropType = 'string' | 'number' | 'boolean' | 'enum' | 'fieldId' | 'fieldId[]' | 'typeId';

export type PropDef = {
  type: PropType;
  description: string;
  required?: boolean;
  default?: unknown;
  enumValues?: string[];
};

export type RegistryEntry = {
  component: React.ComponentType<RegistryComponentProps>;
  label: string;
  category: 'data' | 'layout' | 'display' | 'input';
  description: string;
  acceptsChildren: boolean;
  acceptsDataBinding: boolean;
  propsSchema: Record<string, PropDef>;
};

export type RegistryComponentProps = {
  node: ComponentNode;
  data?: DataContext;
  appId: string;
  children?: React.ReactNode;
};
