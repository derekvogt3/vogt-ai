import { z } from 'zod';

type FieldDef = {
  id: string;
  type: string;
  required: boolean;
};

function zodForFieldType(type: string): z.ZodTypeAny {
  switch (type) {
    case 'text':
    case 'rich_text':
    case 'select':
    case 'date':
      return z.string();
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'multi_select':
      return z.array(z.string());
    case 'url':
      return z.string().url();
    case 'email':
      return z.string().email();
    default:
      return z.unknown();
  }
}

export function buildRecordSchema(fields: FieldDef[], partial = false) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    let validator = zodForFieldType(field.type);

    if (partial || !field.required) {
      validator = validator.optional().nullable();
    }

    shape[field.id] = validator;
  }

  return z.object(shape).passthrough();
}
