import type { RegistryComponentProps } from '../types';

export function TextBlock({ node }: RegistryComponentProps) {
  const content = (node.props.content as string) ?? '';

  return <p className="text-gray-700 leading-relaxed">{content}</p>;
}
