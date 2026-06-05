import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { erp } from '../theme/appTheme'

type Props = { children: React.ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('App crash:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.root}>
          <ScrollView contentContainerStyle={styles.box}>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.message}>{this.state.error.message}</Text>
            <Pressable style={styles.btn} onPress={() => this.setState({ error: null })}>
              <Text style={styles.btnText}>Try again</Text>
            </Pressable>
          </ScrollView>
        </View>
      )
    }
    return this.props.children
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: erp.bg, justifyContent: 'center', padding: 24 },
  box: { gap: 12 },
  title: { fontSize: 20, fontWeight: '800', color: erp.text },
  message: { fontSize: 14, color: erp.danger, lineHeight: 20 },
  btn: {
    marginTop: 8,
    backgroundColor: erp.primary,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center'
  },
  btnText: { color: '#fff', fontWeight: '700' }
})
