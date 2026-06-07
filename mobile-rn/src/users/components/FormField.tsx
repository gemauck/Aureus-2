import React from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { useThemedStyles } from '../../theme/useThemedStyles'
import { useTheme } from '../../theme/ThemeContext'
import type { ErpTheme } from '../../theme/palettes'

type Props = {
  label: string
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  required?: boolean
  keyboardType?: 'default' | 'email-address' | 'phone-pad'
  autoCapitalize?: 'none' | 'sentences' | 'words'
}

export function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  required,
  keyboardType = 'default',
  autoCapitalize = 'sentences'
}: Props) {
  const { erp } = useTheme()
  const styles = useThemedStyles(createStyles)
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.req}> *</Text> : null}
      </Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={erp.textSubtle}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
      />
    </View>
  )
}

const createStyles = ({ erp }: { erp: ErpTheme }) =>
  StyleSheet.create({
    wrap: { gap: 6 },
    label: { fontSize: 13, fontWeight: '600', color: erp.text },
    req: { color: '#ef4444' },
    input: {
      borderWidth: 1,
      borderColor: erp.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 11,
      fontSize: 15,
      color: erp.text,
      backgroundColor: erp.surface
    }
  })
