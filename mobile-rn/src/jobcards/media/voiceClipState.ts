import type { JobCardFormData, VoiceClip } from '../types'

type VoiceSectionField = 'diagnosis' | 'actionsTaken' | 'otherComments' | 'reasonForVisit'

const SECTION_FIELD: Record<string, VoiceSectionField> = {
  diagnosis: 'diagnosis',
  actionsTaken: 'actionsTaken',
  otherComments: 'otherComments',
  reasonForVisit: 'reasonForVisit'
}

function fieldHasTranscriptBlock(fieldText: string, noteNumber: number): boolean {
  const n = Math.max(1, Number(noteNumber) || 1)
  const marker = `----- Voice note ${n} · start -----`
  return String(fieldText || '').includes(marker)
}

/** Mark clips that still need transcription after reopening a pending card. */
export function inferVoiceClipsNeedingTranscription(
  clips: VoiceClip[],
  formData: Pick<JobCardFormData, VoiceSectionField>
): VoiceClip[] {
  return clips.map((clip) => {
    const fieldKey = SECTION_FIELD[clip.section]
    const fieldText = fieldKey ? String(formData[fieldKey] || '') : ''
    const noteNumber = clip.noteNumber != null ? clip.noteNumber : 1
    const hasBlock = fieldHasTranscriptBlock(fieldText, noteNumber)
    return {
      ...clip,
      transcribed: hasBlock,
      needsTranscription: !hasBlock
    }
  })
}
