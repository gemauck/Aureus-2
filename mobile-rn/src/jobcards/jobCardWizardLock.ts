/** True while the job card wizard form is open — blocks disruptive OTA reloads. */
let wizardFormActive = false

export function setJobCardWizardFormActive(active: boolean): void {
  wizardFormActive = active
}

export function isJobCardWizardFormActive(): boolean {
  return wizardFormActive
}
