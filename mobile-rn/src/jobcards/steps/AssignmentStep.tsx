import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useNetwork } from '../../hooks/useNetwork'
import { jobcardsApi } from '../api'
import { cacheClientSites, getCachedClientSites } from '../clientSitesCache'
import { NO_CLIENT_ID, useJobCardWizard } from '../WizardContext'
import { SearchableSelect } from '../components/SearchableSelect'
import { SectionCard } from '../components/SectionCard'
import { useFormStyles } from '../components/formStyles'
import type { ClientOption } from '../types'
import { useThemedStyles } from '../../theme/useThemedStyles'
import type { JcTheme } from '../../theme/palettes'
import { useTheme } from '../../theme/ThemeContext'

type SiteOption = { id: string; name: string }

function technicianLabel(user: { name?: string; email?: string; department?: string; id: string }) {
  const base = user.name || user.email || user.id
  return user.department ? `${base} (${user.department})` : base
}

function technicianValue(user: { name?: string; email?: string; id: string }) {
  return user.name || user.email || user.id
}

function parseSitesFromClient(client: ClientOption): SiteOption[] {
  if (Array.isArray(client.clientSites) && client.clientSites.length) {
    return client.clientSites.map((s) => ({
      id: s.id,
      name: s.name || s.siteName || s.id
    }))
  }

  if (Array.isArray(client.sites) && client.sites.length) {
    return client.sites.map((s, i) => ({
      id: s.id || `site_${i}`,
      name: s.name || s.siteName || `Site ${i + 1}`
    }))
  }

  try {
    if (typeof client.sites === 'string' && client.sites.trim()) {
      const parsed = JSON.parse(client.sites)
      if (Array.isArray(parsed)) {
        return parsed.map((s: { id?: string; name?: string; siteName?: string }, i: number) => ({
          id: s.id || `site_${i}`,
          name: s.name || s.siteName || `Site ${i + 1}`
        }))
      }
    }
  } catch {
    /* ignore */
  }
  return []
}

export function AssignmentStep() {
  const formStyles = useFormStyles()
  const styles = useThemedStyles(createStyles)
  const { jc } = useTheme()
  const {
    formData,
    setFormData,
    clients,
    users,
    projects,
    referenceRefreshing,
    ensureReferenceDataLoaded
  } = useJobCardWizard()
  const { isOnline } = useNetwork()
  const [techInput, setTechInput] = useState('')
  const [availableSites, setAvailableSites] = useState<SiteOption[]>([])
  const [sitesLoading, setSitesLoading] = useState(false)

  useEffect(() => {
    void ensureReferenceDataLoaded()
  }, [ensureReferenceDataLoaded])

  const clientOptions = useMemo(
    () => [
      ...clients.map((c) => ({ value: c.id, label: c.name || c.id })),
      { value: NO_CLIENT_ID, label: 'No Client (enter details manually)' }
    ],
    [clients]
  )

  const leadTechnicianOptions = useMemo(
    () =>
      users.map((u) => {
        const value = technicianValue(u)
        return { value, label: technicianLabel(u) }
      }),
    [users]
  )

  const teamTechnicianOptions = useMemo(
    () =>
      users
        .filter((u) => {
          const value = technicianValue(u)
          return value !== formData.agentName && !formData.otherTechnicians.includes(value)
        })
        .map((u) => {
          const value = technicianValue(u)
          return { value, label: value }
        }),
    [users, formData.agentName, formData.otherTechnicians]
  )

  useEffect(() => {
    let cancelled = false

    async function loadSitesForClient() {
      if (!formData.clientId || formData.clientId === NO_CLIENT_ID) {
        setAvailableSites([])
        return
      }

      const client = clients.find((c) => c.id === formData.clientId)
      if (!client) {
        setAvailableSites([])
        return
      }

      let sites = parseSitesFromClient(client)

      if (sites.length === 0) {
        const cachedSites = await getCachedClientSites(formData.clientId)
        if (cachedSites.length) sites = cachedSites
      }

      if (isOnline && sites.length === 0) {
        setSitesLoading(true)
        try {
          const apiSites = await jobcardsApi.getClientSites(formData.clientId)
          if (!cancelled && apiSites.length) {
            sites = apiSites.map((s, i) => ({
              id: s.id || `site_${i}`,
              name: s.name || `Site ${i + 1}`
            }))
            void cacheClientSites(formData.clientId, sites)
          }
        } finally {
          if (!cancelled) setSitesLoading(false)
        }
      } else if (sites.length) {
        void cacheClientSites(formData.clientId, sites)
      }

      if (!cancelled) {
        setAvailableSites(sites)
        setFormData((prev) =>
          prev.clientName === (client.name || '') ? prev : { ...prev, clientName: client.name || '' }
        )
      }
    }

    void loadSitesForClient()
    return () => {
      cancelled = true
    }
  }, [formData.clientId, clients, isOnline, setFormData])

  useEffect(() => {
    if (!formData.siteId || !availableSites.length) return
    const site = availableSites.find((s) => String(s.id) === String(formData.siteId))
    if (!site?.name) return
    const nextName = String(site.name).trim()
    if (String(formData.siteName || '').trim() === nextName) return
    setFormData((prev) => ({ ...prev, siteName: nextName }))
  }, [formData.siteId, formData.siteName, availableSites, setFormData])

  const siteOptions = availableSites.map((s) => ({ value: s.id, label: s.name }))

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
    const site = availableSites.find((s) => s.id === siteId)
    setFormData((f) => ({ ...f, siteId, siteName: site?.name || '' }))
  }

  function onSiteNameChange(siteName: string) {
    setFormData((f) => ({
      ...f,
      siteName,
      siteId: siteName.trim() ? '' : f.siteId
    }))
  }

  function onProjectChange(projectId: string) {
    const project = projects.find((p) => String(p.id) === String(projectId))
    setFormData((f) => ({
      ...f,
      projectId: projectId || '',
      projectName: project?.name || f.projectName || ''
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

  const listsLoading = referenceRefreshing && !users.length && !clients.length

  return (
    <View>
      {listsLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={jc.primary} size="small" />
          <Text style={styles.loadingText}>Loading technicians and clients…</Text>
        </View>
      ) : null}

      <SectionCard title="Heading" subtitle="Short label for this visit." accent>
        <TextInput
          style={formStyles.input}
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
          options={leadTechnicianOptions}
          onChange={(agentName) => setFormData((f) => ({ ...f, agentName }))}
          placeholder="Choose technician…"
          loading={referenceRefreshing && !leadTechnicianOptions.length}
          emptyLabel="No technicians available — check connection and try again"
        />
      </SectionCard>

      <SectionCard title="Team members" subtitle="Additional technicians on site.">
        <SearchableSelect
          label="Add team member"
          value={techInput}
          options={teamTechnicianOptions}
          onChange={setTechInput}
          placeholder="Search team members…"
          loading={referenceRefreshing && !teamTechnicianOptions.length}
          emptyLabel="No team members available"
        />
        <Pressable
          style={[formStyles.primaryBtn, !techInput && styles.addBtnDisabled]}
          disabled={!techInput}
          onPress={addTechnician}
        >
          <Text style={formStyles.primaryBtnText}>+ Add to team</Text>
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
          loading={referenceRefreshing && !clientOptions.length}
          emptyLabel="No clients available — check connection and try again"
        />
        {formData.clientId === NO_CLIENT_ID ? (
          <>
            <TextInput
              style={formStyles.input}
              placeholder="Client name (manual)"
              placeholderTextColor={jc.textSubtle}
              value={formData.clientName}
              onChangeText={(clientName) => setFormData((f) => ({ ...f, clientName }))}
            />
            <TextInput
              style={formStyles.input}
              placeholder="Site (manual)"
              placeholderTextColor={jc.textSubtle}
              value={formData.siteName}
              onChangeText={(siteName) => setFormData((f) => ({ ...f, siteName }))}
            />
          </>
        ) : (
          <>
            {siteOptions.length > 0 ? (
              <SearchableSelect
                label="Site"
                value={formData.siteId}
                options={siteOptions}
                onChange={onSiteChange}
                placeholder={sitesLoading ? 'Loading sites…' : 'Search sites…'}
                disabled={!formData.clientId || sitesLoading}
                loading={sitesLoading}
                emptyLabel="No sites for this client"
              />
            ) : null}
            <TextInput
              style={formStyles.input}
              placeholder={
                siteOptions.length
                  ? 'Site name (if not listed)'
                  : sitesLoading
                    ? 'Loading sites…'
                    : 'Site name (manual)'
              }
              placeholderTextColor={jc.textSubtle}
              value={formData.siteName}
              onChangeText={onSiteNameChange}
              editable={!sitesLoading}
            />
          </>
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
                ? 'No projects linked to selected client'
                : 'No projects available'
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
        <TextInput
          style={formStyles.input}
          placeholder="Project name (manual if not listed)"
          placeholderTextColor={jc.textSubtle}
          value={formData.projectName}
          onChangeText={(projectName) => setFormData((f) => ({ ...f, projectName }))}
        />
      </SectionCard>
    </View>
  )
}

function createStyles({ jc }: { jc: JcTheme }) {
  return StyleSheet.create({
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: jc.space.md,
    paddingHorizontal: 4
  },
  loadingText: { color: jc.textMuted, fontSize: 13 },
  addBtnDisabled: { opacity: 0.5 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    backgroundColor: jc.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: jc.radius.sm,
    borderWidth: 1,
    borderColor: jc.primaryMuted
  },
  tagText: { color: jc.primaryDark, fontSize: 13, fontWeight: '600' }
  })
}