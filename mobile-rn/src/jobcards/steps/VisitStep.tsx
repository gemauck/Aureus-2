import React from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { JOB_CARD_CALL_OUT_CATEGORY_OPTIONS } from '../../../../src/jobCardWizard/constants.js'
import { useJobCardWizard } from '../WizardContext'
import { DateTimeField } from '../components/DateTimeField'
import { SectionCard } from '../components/SectionCard'
import { LocationPickerModal } from '../map/LocationPickerModal'

export function VisitStep() {
  const { formData, setFormData, editingMeta } = useJobCardWizard()
  const [mapOpen, setMapOpen] = React.useState(false)

  return (
    <View>
      <SectionCard title="Call Out Category">
        <View style={styles.pickerWrap}>
          {JOB_CARD_CALL_OUT_CATEGORY_OPTIONS.map((opt: string) => (
            <Pressable
              key={opt}
              style={[styles.chip, formData.callOutCategory === opt && styles.chipActive]}
              onPress={() => setFormData((f) => ({ ...f, callOutCategory: opt }))}
            >
              <Text style={formData.callOutCategory === opt ? styles.chipTextActive : styles.chipText}>
                {opt}
              </Text>
            </Pressable>
          ))}
        </View>
      </SectionCard>

      <SectionCard title="Visit Details">
        <Text style={styles.label}>Location</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={formData.location}
            onChangeText={(location) => setFormData((f) => ({ ...f, location }))}
            placeholder="Facility, area or coordinates"
          />
          <Pressable style={styles.mapBtn} onPress={() => setMapOpen(true)}>
            <Text style={styles.mapBtnText}>Map</Text>
          </Pressable>
        </View>
        {formData.latitude && formData.longitude ? (
          <Text style={styles.coords}>
            {formData.latitude}, {formData.longitude}
          </Text>
        ) : null}
        <Text style={styles.label}>Reason for Call Out / Visit</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          multiline
          value={formData.reasonForVisit}
          onChangeText={(reasonForVisit) => setFormData((f) => ({ ...f, reasonForVisit }))}
          placeholder="Why was the technician requested?"
        />
      </SectionCard>

      <SectionCard
        title="Job time"
        subtitle="Set or change your arrival time on site."
        accent
      >
        <DateTimeField
          label="Arrival on site *"
          value={formData.timeOfArrival}
          onChange={(timeOfArrival) => setFormData((f) => ({ ...f, timeOfArrival }))}
        />
        {!editingMeta?.useNewJobTimeFlow ? (
          <>
            <DateTimeField
              label="Departure from site"
              value={formData.departureFromSite}
              onChange={(departureFromSite) => setFormData((f) => ({ ...f, departureFromSite }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Vehicle used"
              value={formData.vehicleUsed}
              onChangeText={(vehicleUsed) => setFormData((f) => ({ ...f, vehicleUsed }))}
            />
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                keyboardType="numeric"
                placeholder="KM before"
                value={String(formData.kmReadingBefore || '')}
                onChangeText={(kmReadingBefore) => setFormData((f) => ({ ...f, kmReadingBefore }))}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                keyboardType="numeric"
                placeholder="KM after"
                value={String(formData.kmReadingAfter || '')}
                onChangeText={(kmReadingAfter) => setFormData((f) => ({ ...f, kmReadingAfter }))}
              />
            </View>
          </>
        ) : null}
      </SectionCard>

      <LocationPickerModal
        visible={mapOpen}
        onClose={() => setMapOpen(false)}
        onConfirm={({ latitude, longitude, label }) => {
          setFormData((f) => ({
            ...f,
            latitude: String(latitude),
            longitude: String(longitude),
            location: label || f.location
          }))
          setMapOpen(false)
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#fff'
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  mapBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10
  },
  mapBtnText: { color: '#fff', fontWeight: '700' },
  coords: { fontSize: 12, color: '#64748b' },
  pickerWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  chipActive: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  chipText: { color: '#334155', fontSize: 13 },
  chipTextActive: { color: '#fff', fontSize: 13, fontWeight: '600' }
})
