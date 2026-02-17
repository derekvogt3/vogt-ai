import type { RegistryComponentProps } from '../types';

const PADDING_MAP: Record<string, string> = {
  none: '',
  sm: 'p-2',
  md: 'p-4',
  lg: 'p-8',
};

const MAX_WIDTH_MAP: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  full: 'max-w-full',
};

export function Container({ node, children }: RegistryComponentProps) {
  const padding = PADDING_MAP[(node.props.padding as string) ?? 'md'] ?? PADDING_MAP.md;
  const maxWidth = MAX_WIDTH_MAP[(node.props.maxWidth as string) ?? '5xl'] ?? MAX_WIDTH_MAP['5xl'];

  return (
    <div className={`mx-auto ${maxWidth} ${padding}`}>
      {children}
    </div>
  );
}
