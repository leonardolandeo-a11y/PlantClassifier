import { Pressable, Text } from 'react-native';
import { styles } from '../theme';
export function ActionButton({title, onPress, disabled = false, danger = false}: {title: string; onPress?: () => void; disabled?: boolean; danger?: boolean}) {
  return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPressIn={danger ? onPress : undefined} onPress={onPress} style={({pressed}) => [styles.button, danger && styles.danger, (disabled || pressed) && styles.disabled]}><Text style={[styles.buttonText, danger && {color: '#ffffff'}]}>{title}</Text></Pressable>;
}
