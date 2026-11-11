import { Pressable, Text } from 'react-native';
import { styles } from '../theme';
export function ActionButton({title, onPress, disabled = false}: {title: string; onPress?: () => void; disabled?: boolean}) {
  return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed}) => [styles.button, (disabled || pressed) && styles.disabled]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
}
