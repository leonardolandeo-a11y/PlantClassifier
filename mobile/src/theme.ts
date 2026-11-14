import { StyleSheet } from 'react-native';
export const colors = { background: '#0c1220', surface: '#151f30', line: '#2b3a50', text: '#e9eef7', muted: '#a5b4ca', accent: '#7cc9ff', orange: '#ffb36d', error: '#ffb8ae' };
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 12, gap: 12, paddingBottom: 20 },
  header: {flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderBottomWidth: 1, borderColor: colors.line, flexWrap: 'wrap'},
  columns: {flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start'},
  column: {flexGrow: 1, flexBasis: 260, minWidth: 0, gap: 12},
  danger: {backgroundColor: '#b92c40'},
  title: { fontSize: 34, fontWeight: '700', color: colors.text },
  heading: { fontSize: 20, fontWeight: '600', color: colors.text },
  body: { fontSize: 14, lineHeight: 22, color: colors.muted },
  eyebrow: { fontSize: 10, letterSpacing: 2, color: colors.accent, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  row: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  button: { backgroundColor: colors.accent, padding: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  buttonText: { color: colors.background, fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  error: { color: colors.error, lineHeight: 22 },
  input: { borderColor: colors.line, borderWidth: 1, color: colors.text, borderRadius: 12, padding: 14, minHeight: 52 },
});
