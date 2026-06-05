import React, { useMemo, useState } from 'react'
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { jc } from '../theme'

type Props = {
  label: string
  value: string
  onChange: (isoLocal: string) => void
  mode?: 'datetime' | 'date'
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function toDatetimeLocal(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function toDateLocal(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Parse datetime-local or date-only strings without timezone surprises. */
export function parseFieldDate(value: string, mode: 'datetime' | 'date'): Date {
  if (!value || !String(value).trim()) return new Date()
  const s = String(value).trim()
  const dt = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (dt) {
    return new Date(
      Number(dt[1]),
      Number(dt[2]) - 1,
      Number(dt[3]),
      Number(dt[4]),
      Number(dt[5]),
      0,
      0
    )
  }
  const dOnly = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (dOnly) {
    return new Date(Number(dOnly[1]), Number(dOnly[2]) - 1, Number(dOnly[3]), 12, 0, 0, 0)
  }
  const parsed = new Date(s)
  if (!Number.isNaN(parsed.getTime())) return parsed
  return new Date()
}

function formatDisplay(value: string, mode: 'datetime' | 'date') {
  if (!value) return mode === 'date' ? 'Select date' : 'Select date & time'
  const d = parseFieldDate(value, mode)
  if (mode === 'date') {
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  }
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function DateTimeField({ label, value, onChange, mode = 'datetime' }: Props) {
  const [show, setShow] = useState(false)
  const [draft, setDraft] = useState(() => parseFieldDate(value, mode))
  /** Android datetime uses date picker then time picker. */
  const [androidStep, setAndroidStep] = useState<'date' | 'time'>('date')

  const display = useMemo(() => formatDisplay(value, mode), [value, mode])
  const pickerMode = mode === 'date' ? 'date' : Platform.OS === 'android' ? androidStep : 'datetime'

  function openPicker() {
    setDraft(parseFieldDate(value, mode))
    setAndroidStep('date')
    setShow(true)
  }

  function closePicker() {
    setShow(false)
    setAndroidStep('date')
  }

  function commit(selected: Date) {
    onChange(mode === 'date' ? toDateLocal(selected) : toDatetimeLocal(selected))
    closePicker()
  }

  function onPickerChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') {
      if (event.type === 'dismissed') {
        closePicker()
        return
      }
      if (!selected) return

      if (mode === 'datetime' && androidStep === 'date') {
        const merged = new Date(selected)
        merged.setHours(draft.getHours(), draft.getMinutes(), 0, 0)
        setDraft(merged)
        setAndroidStep('time')
        return
      }

      commit(selected)
      return
    }
    if (selected) setDraft(selected)
  }

  const picker = (
    <DateTimePicker
      key={Platform.OS === 'android' ? androidStep : 'ios'}
      value={draft}
      mode={pickerMode}
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      onChange={onPickerChange}
    />
  )

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.btn} onPress={openPicker}>
        <Text style={value ? styles.value : styles.placeholder}>{display}</Text>
      </Pressable>
      <Pressable onPress={() => commit(new Date())} style={styles.link}>
        <Text style={styles.linkText}>{mode === 'date' ? 'Use today' : 'Use current time'}</Text>
      </Pressable>

      {Platform.OS === 'ios' ? (
        <Modal visible={show} transparent animationType="fade" onRequestClose={closePicker}>
          <Pressable style={styles.backdrop} onPress={closePicker} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{label}</Text>
            {picker}
            <View style={styles.sheetActions}>
              <Pressable style={styles.cancelBtn} onPress={closePicker}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.doneBtn} onPress={() => commit(draft)}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : (
        <Modal visible={show} transparent animationType="fade" onRequestClose={closePicker}>
          <Pressable style={styles.backdrop} onPress={closePicker} />
          <View style={styles.androidSheet}>
            <Text style={styles.sheetTitle}>
              {mode === 'datetime' && androidStep === 'time' ? `${label} — time` : label}
            </Text>
            {picker}
            <Pressable style={styles.cancelBtnWide} onPress={closePicker}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Modal>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: jc.textMuted },
  btn: {
    borderWidth: 1,
    borderColor: jc.border,
    borderRadius: jc.radius.md,
    padding: 14,
    backgroundColor: jc.surface
  },
  value: { fontSize: 16, color: jc.text, fontWeight: '500' },
  placeholder: { fontSize: 16, color: jc.textSubtle },
  link: { alignSelf: 'flex-start' },
  linkText: { color: jc.primaryDark, fontWeight: '600', fontSize: 13 },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.35)'
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: jc.surface,
    borderTopLeftRadius: jc.radius.xl,
    borderTopRightRadius: jc.radius.xl,
    padding: jc.space.lg,
    paddingBottom: jc.space.xl
  },
  androidSheet: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: '25%',
    backgroundColor: jc.surface,
    borderRadius: jc.radius.xl,
    padding: jc.space.lg,
    ...jc.shadow
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: jc.text, marginBottom: jc.space.sm },
  sheetActions: { flexDirection: 'row', gap: jc.space.sm, marginTop: jc.space.sm },
  cancelBtn: {
    flex: 1,
    padding: 12,
    borderRadius: jc.radius.md,
    backgroundColor: jc.surfaceMuted,
    alignItems: 'center'
  },
  cancelBtnWide: {
    padding: 12,
    borderRadius: jc.radius.md,
    backgroundColor: jc.surfaceMuted,
    alignItems: 'center',
    marginTop: jc.space.sm
  },
  cancelText: { color: jc.textMuted, fontWeight: '600' },
  doneBtn: {
    flex: 1,
    padding: 12,
    borderRadius: jc.radius.md,
    backgroundColor: jc.primary,
    alignItems: 'center'
  },
  doneText: { color: '#fff', fontWeight: '700' }
})
