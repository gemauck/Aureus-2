import React, { useEffect, useMemo } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { NO_CLIENT_ID, useJobCardWizard } from '../WizardContext'
import { SearchableSelect } from '../components/SearchableSelect'
import { SectionCard } from '../components/SectionCard'
import { jc } from '../theme'

function parseSites(client: { sites?: string; clientSites?: Array<{ id: string; name?: string }> }) {
  if (Array.isArray(client.clientSites) && client.clientSites.length) {
    return client.clientSites.map((s) => ({
      id: s.id,
      name: s.name || s.id
    }))
  }
  try {
    if (typeof client.sites === 'string' && client.sites.trim()) {
      const parsed = JSON.parse(client.sites)
      if (Array.isArray(parsed)) {
        return parsed.map((s: { id?: string; name?: string }, i: number) => ({
          id: s.id || `site_${i}`,
          name: s.name || `Site ${i + 1}`
        }))
      }
    }
  } catch {
    /* ignore */
  }
  return []
}

export function AssignmentStep() {
  const { formData, setFormData, clients, users, projects } = useJobCardWizard()
  const [techInput, setTechInput] = React.useState('')

  const clientOptions = useMemo(
    () => [
      { value: NO_CLIENT_ID, label: 'No Client (enter details manually)' },
      ...clients.map((c) => ({ value: c.id, label: c.name || c.id }))
    ],
    [clients]
  )

  const userOptions = useMemo(
    () =>
      users.map((u) => ({
        value: u.name || u.email || u.id,
        label: u.name || u.email || u.id
      })),
    [users]
  )

  const sites = useMemo(() => {
    const c = clients.find((x) => x.id === formData.clientId)
    return c ? parseSites(c) : []
  }, [clients, formData.clientId])

  const siteOptions = sites.map((s) => ({ value: s.id, label: s.name }))

  const projectOptions = useMemo(() => {
    const hasClientFilter = Boolean(formData.clientId) && formData.clientId !== NO_CLIENT_ID
    const selectedClient = clients.find((c) => c.id === formData.clientId)
    const selectedClientName = (selectedClient?.name || '').trim().toLowerCase()

    return projects
      .filter((project) => {
        if (!hasClientFilter) return true
        const projectClientId = project.clientId ? String(project.clientId) : ''
        if (projectClientId && projectClientId === String(formData.clientId)) return true
        const projectClientName = (project.clientName || '').trim().toLowerCase()
        return Boolean(projectClientName && selectedClientName && projectClientName === selectedClientName)
      })
      .map((p) => ({ value: p.id, label: p.name || p.id }))
  }, [projects, clients, formData.clientId])

  useEffect(() => {
    if (!formData.projectId) return
    const stillValid = projectOptions.some((p) => String(p.value) === String(formData.projectId))
    if (!stillValid) {
      setFormData((prev) => ({ ...prev, projectId: '', projectName: '' }))
    }
  }, [formData.projectId, projectOptions, setFormData])

  function onClientChange(clientId: string) {
    const client = clients.find((c) => c.id === clientId)
    setFormData((f) => ({
      ...f,
      clientId,
      clientName: clientId === NO_CLIENT_ID ? f.clientName : client?.name || '',
      siteId: '',
      siteName: '',
      projectId: '',
      projectName: ''
    }))
  }

  function onSiteChange(siteId: string) {
    const site = sites.find((s) => s.id === siteId)
    setFormData((f) => ({ ...f, siteId, siteName: site?.name || '' }))
  }

  function onProjectChange(projectId: string) {
    const project = projects.find((p) => String(p.id) === String(projectId))
    setFormData((f) => ({
      ...f,
      projectId: projectId || '',
      projectName: project?.name || ''
    }))
  }

  function addTechnician() {
    if (!techInput || formData.otherTechnicians.includes(techInput)) return
    setFormData((f) => ({
      ...f,
      otherTechnicians: [...f.otherTechnicians, techInput]
    }))
    setTechInput('')
  }

  return (
    <View>
      <SectionCard title="Heading" subtitle="Short label for this visit." accent>
        <TextInput
          style={styles.input}
          value={formData.heading}
          onChangeText={(heading) => setFormData((f) => ({ ...f, heading }))}
          placeholder="e.g. Pump service — Unit 3"
          placeholderTextColor={jc.textSubtle}
        />
      </SectionCard>

      <SectionCard title="Lead technician" subtitle="Primary technician on this job.">
        <SearchableSelect
          label="Technician *"
          value={formData.agentName}
          options={userOptions}
          onChange={(agentName) => setFormData((f) => ({ ...f, agentName }))}
          placeholder="Choose technician…"
        />
      </SectionCard>

      <SectionCard title="Team members" subtitle="Additional technicians on site.">
        <SearchableSelect
          label="Add team member"
          value={techInput}
          options={userOptions}
          onChange={setTechInput}
          placeholder="Search team members…"
        />
        <Pressable style={styles.addBtn} onPress={addTechnician}>
          <Text style={styles.addBtnText}>+ Add to team</Text>
        </Pressable>
        {formData.otherTechnicians.length ? (
          <View style={styles.tags}>
            {formData.otherTechnicians.map((t) => (
              <Pressable
                key={t}
                style={styles.tag}
                onPress={() =>
                  setFormData((f) => ({
                    ...f,
                    otherTechnicians: f.otherTechnicians.filter((x) => x !== t)
                  }))
                }
              >
                <Text style={styles.tagText}>{t} ×</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </SectionCard>

      <SectionCard title="Client & site" subtitle="Who and where this job is for.">
        <SearchableSelect
          label="Client *"
          value={formData.clientId}
          options={clientOptions}
          onChange={onClientChange}
          placeholder="Search clients…"
        />
        {formData.clientId === NO_CLIENT_ID ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Client name (manual)"
              placeholderTextColor={jc.textSubtle}
              value={formData.clientName}
              onChangeText={(clientName) => setFormData((f) => ({ ...f, clientName }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Site (manual)"
              placeholderTextColor={jc.textSubtle}
              value={formData.siteName}
              onChangeText={(siteName) => setFormData((f) => ({ ...f, siteName }))}
            />
          </>
        ) : (
          <SearchableSelect
            label="Site"
            value={formData.siteId}
            options={siteOptions}
            onChange={onSiteChange}
            placeholder={siteOptions.length ? 'Search sites…' : 'No sites for client'}
            disabled={!formData.clientId || siteOptions.length === 0}
          />
        )}
      </SectionCard>

      <SectionCard title="Project" subtitle="Link this job card to an ERP project.">
        <SearchableSelect
          label="Project"
          value={formData.projectId}
          options={projectOptions}
          onChange={onProjectChange}
          placeholder={
            projectOptions.length
              ? 'Search projects…'
              : formData.clientId && formData.clientId !== NO_CLIENT_ID
                ? 'No projects for this client'
                : 'Select a client to filter projects'
          }
          disabled={!projectOptions.length}
          hint={
            formData.projectName
              ? `Selected: ${formData.projectName}`
              : projects.length
                ? `${projectOptions.length} project${projectOptions.length === 1 ? '' : 's'} available`
                : 'Projects load when online'
          }
        />
      </SectionCard>
    </View>
  )
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: jc.border,
    borderRadius: jc.radius.md,
    padding: 14,
    fontSize: 16,
    backgroundColor: jc.surface,
    color: jc.text
  },
  addBtn: {
    backgroundColor: jc.primary,
    padding: 12,
    borderRadius: jc.radius.md,
    alignItems: 'center'
  },
  addBtnText: { color: '#fff', fontWeight: '700' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    backgroundColor: jc.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: jc.radius.sm
  },
  tagText: { color: jc.primaryDark, fontSize: 13, fontWeight: '600' }
})
