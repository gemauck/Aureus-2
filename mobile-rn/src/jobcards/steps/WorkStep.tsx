import React from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useJobCardWizard } from '../WizardContext'
import { SectionCard } from '../components/SectionCard'
import { VoiceNoteField } from '../media/VoiceNoteField'
import { SectionMediaPicker } from '../media/SectionMediaPicker'
import { ServiceFormSection } from '../serviceForms/ServiceFormSection'

export function WorkStep() {
  const {
    formData,
    setFormData,
    sectionWorkMedia,
    setSectionWorkMedia,
    voiceAttachments,
    setVoiceAttachments
  } = useJobCardWizard()

  return (
    <View>
      <SectionCard title="Diagnosis" subtitle="What was found on site?">
        <TextInput
          style={[styles.input, styles.multiline]}
          multiline
          value={formData.diagnosis}
          onChangeText={(diagnosis) => setFormData((f) => ({ ...f, diagnosis }))}
          placeholder="Diagnosis notes…"
        />
        <VoiceNoteField
          section="diagnosis"
          voiceClips={voiceAttachments}
          onVoiceSaved={(clip) => setVoiceAttachments((v) => [...v, clip])}
          onRemove={(id) => setVoiceAttachments((v) => v.filter((x) => x.id !== id))}
        />
        <SectionMediaPicker
          section="diagnosis"
          items={sectionWorkMedia.diagnosis}
          onChange={(diagnosis) => setSectionWorkMedia((m) => ({ ...m, diagnosis }))}
        />
      </SectionCard>

      <SectionCard title="Actions Taken">
        <TextInput
          style={[styles.input, styles.multiline]}
          multiline
          value={formData.actionsTaken}
          onChangeText={(actionsTaken) => setFormData((f) => ({ ...f, actionsTaken }))}
          placeholder="Work performed…"
        />
        <VoiceNoteField
          section="actionsTaken"
          voiceClips={voiceAttachments}
          onVoiceSaved={(clip) => setVoiceAttachments((v) => [...v, clip])}
          onRemove={(id) => setVoiceAttachments((v) => v.filter((x) => x.id !== id))}
        />
        <SectionMediaPicker
          section="actionsTaken"
          items={sectionWorkMedia.actionsTaken}
          onChange={(actionsTaken) => setSectionWorkMedia((m) => ({ ...m, actionsTaken }))}
        />
      </SectionCard>

      <SectionCard title="Future Work Required">
        <TextInput
          style={[styles.input, styles.multiline]}
          multiline
          value={formData.futureWorkRequired}
          onChangeText={(futureWorkRequired) => setFormData((f) => ({ ...f, futureWorkRequired }))}
          placeholder="Follow-up work…"
        />
        <SectionMediaPicker
          section="futureWorkRequired"
          items={sectionWorkMedia.futureWorkRequired}
          onChange={(futureWorkRequired) => setSectionWorkMedia((m) => ({ ...m, futureWorkRequired }))}
        />
      </SectionCard>

      <SectionCard title="Other Comments">
        <TextInput
          style={[styles.input, styles.multiline]}
          multiline
          value={formData.otherComments}
          onChangeText={(otherComments) => setFormData((f) => ({ ...f, otherComments }))}
        />
      </SectionCard>

      <ServiceFormSection />
    </View>
  )
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#fff'
  },
  multiline: { minHeight: 100, textAlignVertical: 'top' }
})
