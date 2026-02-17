import type { RegistryComponentProps } from '../types';

export function Heading({ node }: RegistryComponentProps) {
  const text = (node.props.text as string) ?? '';
  const level = (node.props.level as number) ?? 1;

  const classes: Record<number, string> = {
    1: 'text-3xl font-bold text-gray-900',
    2: 'text-2xl font-semibold text-gray-900',
    3: 'text-xl font-semibold text-gray-900',
    4: 'text-lg font-medium text-gray-900',
  };

  const Tag = `h${Math.min(Math.max(level, 1), 4)}` as 'h1' | 'h2' | 'h3' | 'h4';

  return <Tag className={classes[level] ?? classes[1]}>{text}</Tag>;
}
