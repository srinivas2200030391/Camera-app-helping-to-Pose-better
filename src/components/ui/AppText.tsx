import { Text, type TextProps } from 'react-native';

import { colors, typography, type TypographyVariant } from '@/theme/tokens';

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: string;
  align?: 'left' | 'center' | 'right';
  uppercase?: boolean;
}

export function AppText({ variant = 'body', color = colors.text, align, uppercase, style, ...rest }: AppTextProps) {
  return (
    <Text
      {...rest}
      style={[
        typography[variant],
        { color, textAlign: align, textTransform: uppercase ? 'uppercase' : undefined },
        style,
      ]}
    />
  );
}
