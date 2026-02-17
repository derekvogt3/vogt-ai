import { Link } from 'react-router';
import type { RegistryComponentProps } from '../types';

const VARIANT_CLASSES: Record<string, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  secondary: 'border border-gray-300 text-gray-700 hover:bg-gray-50',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

export function ButtonComponent({ node }: RegistryComponentProps) {
  const label = (node.props.label as string) ?? 'Button';
  const href = node.props.href as string | undefined;
  const variant = (node.props.variant as string) ?? 'primary';

  const classes = `inline-block rounded-lg px-4 py-2 text-sm font-medium ${VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.primary}`;

  if (href) {
    return (
      <Link to={href} className={classes}>
        {label}
      </Link>
    );
  }

  return <button className={classes}>{label}</button>;
}
