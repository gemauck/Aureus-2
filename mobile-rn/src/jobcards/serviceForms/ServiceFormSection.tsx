import React, { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useJobCardWizard } from '../WizardContext'
import { SearchableSelect } from '../components/SearchableSelect'
import { jc } from '../theme'

export function ServiceFormSection() {
  const { formTemplates, formData, setFormData } = useJobCardWizard()
  const [templateId, setTemplateId] = useState('')

  const templateOptions = formTemplates.map((t) => ({ value: t.id, label: t.name }))
  const template = formTemplates.find((t) => t.id === templateId)

  function addInstance() {
    if (!template) return
    setFormData((f) => ({
      ...f,
      serviceForms: [
        ...f.serviceForms,
        {
          id: `sf_${Date.now()}`,
          templateId: template.id,
          templateName: template.name,
          answers: {}
        }
      ]
    }))
    setTemplateId('')
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Service forms</Text>
      <SearchableSelect
        label="Add template"
        value={templateId}
        options={templateOptions}
        onChange={setTemplateId}
        placeholder="Choose form template…"
      />
      <Pressable style={styles.btn} onPress={addInstance}>
        <Text style={styles.btnText}>Attach form</Text>
      </Pressable>
      {formData.serviceForms.map((inst) => {
        const tpl = formTemplates.find((t) => t.id === inst.templateId)
        return (
        <View key={inst.id} style={styles.instance}>
          <Text style={styles.instTitle}>{inst.templateName}</Text>
          {(tpl?.fields || []).map((field, idx) => {
            const fid = String((field as { id?: string }).id || idx)
            return (
              <TextInput
                key={fid}
                style={styles.input}
                placeholder={String((field as { label?: string }).label || fid)}
                value={String(inst.answers[fid] || '')}
                onChangeText={(v) =>
                  setFormData((f) => ({
                    ...f,
                    serviceForms: f.serviceForms.map((sf) =>
                      sf.id === inst.id
                        ? { ...sf, answers: { ...sf.answers, [fid]: v } }
                        : sf
                    )
                  }))
                }
              />
            )
          })}
        </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: jc.text },
  btn: { backgroundColor: jc.primary, padding: 12, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600' },
  instance: {
    borderWidth: 1,
    borderColor: jc.border,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    backgroundColor: jc.surface
  },
  instTitle: { fontWeight: '700', color: jc.text },
  input: {
    borderWidth: 1,
    borderColor: jc.border,
    borderRadius: 8,
    padding: 10,
    backgroundColor: jc.surfaceMuted,
    color: jc.text
  }
})
