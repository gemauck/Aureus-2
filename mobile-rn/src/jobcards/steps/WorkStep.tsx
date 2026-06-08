import React from 'react'
import { StyleSheet, TextInput, View } from 'react-native'
import { useJobCardWizard } from '../WizardContext'
import { SectionCard } from '../components/SectionCard'
import { DateTimeField } from '../components/DateTimeField'
import { useFormStyles } from '../components/formStyles'
import { VoiceNoteField } from '../media/VoiceNoteField'
import { SectionMediaPicker } from '../media/SectionMediaPicker'
import { ServiceFormSection } from '../serviceForms/ServiceFormSection'
import { useTheme } from '../../theme/ThemeContext'

export function WorkStep() {
  const { jc } = useTheme()
  const formStyles = useFormStyles()
  const {
    formData,
    setFormData,
    sectionWorkMedia,
    setSectionWorkMedia,
    voiceAttachments,
    setVoiceAttachments,
    saveDraftQuiet
  } = useJobCardWizard()

  const afterTranscription = () => void saveDraftQuiet({ forceDraft: true })

  return (
    <View>
      <SectionCard
        title="Diagnosis"
        subtitle="Summarise the fault, findings or observations."
      >
        <TextInput
          style={[formStyles.input, formStyles.multiline]}
          multiline
          value={formData.diagnosis}
          onChangeText={(diagnosis) => setFormData((f) => ({ ...f, diagnosis }))}
          placeholder="e.g. Pump not priming due to airlock in suction line…"
          placeholderTextColor={jc.textSubtle}
        />
        <VoiceNoteField
          section="diagnosis"
          voiceClips={voiceAttachments}
          fieldValue={formData.diagnosis}
          onFieldChange={(diagnosis) => setFormData((f) => ({ ...f, diagnosis }))}
          onVoiceSaved={(clip) => setVoiceAttachments((v) => [...v, clip])}
          onVoiceClipUpdate={(id, patch) =>
            setVoiceAttachments((v) => v.map((c) => (c.id === id ? { ...c, ...patch } : c)))
          }
          onRemove={(id) => setVoiceAttachments((v) => v.filter((x) => x.id !== id))}
          onAfterTranscription={afterTranscription}
        />
        <SectionMediaPicker
          section="diagnosis"
          items={sectionWorkMedia.diagnosis}
          onChange={(diagnosis) => setSectionWorkMedia((m) => ({ ...m, diagnosis }))}
        />
      </SectionCard>

      <SectionCard title="Actions Taken" subtitle="Document work performed on site.">
        <TextInput
          style={[formStyles.input, formStyles.multiline]}
          multiline
          value={formData.actionsTaken}
          onChangeText={(actionsTaken) => setFormData((f) => ({ ...f, actionsTaken }))}
          placeholder="Work performed…"
          placeholderTextColor={jc.textSubtle}
        />
        <VoiceNoteField
          section="actionsTaken"
          voiceClips={voiceAttachments}
          fieldValue={formData.actionsTaken}
          onFieldChange={(actionsTaken) => setFormData((f) => ({ ...f, actionsTaken }))}
          onVoiceSaved={(clip) => setVoiceAttachments((v) => [...v, clip])}
          onVoiceClipUpdate={(id, patch) =>
            setVoiceAttachments((v) => v.map((c) => (c.id === id ? { ...c, ...patch } : c)))
          }
          onRemove={(id) => setVoiceAttachments((v) => v.filter((x) => x.id !== id))}
          onAfterTranscription={afterTranscription}
        />
        <SectionMediaPicker
          section="actionsTaken"
          items={sectionWorkMedia.actionsTaken}
          onChange={(actionsTaken) => setSectionWorkMedia((m) => ({ ...m, actionsTaken }))}
        />
      </SectionCard>

      <SectionCard
        title="Future Work"
        subtitle="Capture additional work required and schedule the next visit."
      >
        <TextInput
          style={[formStyles.input, formStyles.multiline]}
          multiline
          value={formData.futureWorkRequired}
          onChangeText={(futureWorkRequired) => setFormData((f) => ({ ...f, futureWorkRequired }))}
          placeholder="Describe remaining tasks, parts to source, or follow-up work…"
          placeholderTextColor={jc.textSubtle}
        />
        <SectionMediaPicker
          section="futureWorkRequired"
          items={sectionWorkMedia.futureWorkRequired}
          onChange={(futureWorkRequired) => setSectionWorkMedia((m) => ({ ...m, futureWorkRequired }))}
        />
        <DateTimeField
          label="Scheduled follow-up date & time"
          value={formData.futureWorkScheduledAt}
          onChange={(futureWorkScheduledAt) => setFormData((f) => ({ ...f, futureWorkScheduledAt }))}
        />
      </SectionCard>

      <SectionCard
        title="Additional Notes"
        subtitle="Handover notes, risks or recommended next actions."
      >
        <TextInput
          style={[formStyles.input, formStyles.multiline]}
          multiline
          value={formData.otherComments}
          onChangeText={(otherComments) => setFormData((f) => ({ ...f, otherComments }))}
          placeholder="Outstanding concerns, customer requests, safety notes…"
          placeholderTextColor={jc.textSubtle}
        />
        <VoiceNoteField
          section="otherComments"
          voiceClips={voiceAttachments}
          fieldValue={formData.otherComments}
          onFieldChange={(otherComments) => setFormData((f) => ({ ...f, otherComments }))}
          onVoiceSaved={(clip) => setVoiceAttachments((v) => [...v, clip])}
          onVoiceClipUpdate={(id, patch) =>
            setVoiceAttachments((v) => v.map((c) => (c.id === id ? { ...c, ...patch } : c)))
          }
          onRemove={(id) => setVoiceAttachments((v) => v.filter((x) => x.id !== id))}
          onAfterTranscription={afterTranscription}
        />
      </SectionCard>

      <ServiceFormSection />
    </View>
  )
}
