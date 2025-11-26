/**
 * Document Collection API Service
 * Clean, centralized API service for document collection operations
 * Version: 20250127-refactor
 */

class DocumentCollectionAPI {
    constructor() {
        this.baseURL = window.location.origin;
        this.token = null;
        this.updateToken();
    }

    /**
     * Update authentication token
     */
    updateToken() {
        this.token = window.storage?.getToken?.() || null;
    }

    /**
     * Make authenticated API request
     */
    async request(endpoint, options = {}) {
        this.updateToken();
        
        const url = `${this.baseURL}${endpoint}`;
        const defaultHeaders = {
            'Content-Type': 'application/json',
        };

        if (this.token) {
            defaultHeaders['Authorization'] = `Bearer ${this.token}`;
        }

        const config = {
            ...options,
            headers: {
                ...defaultHeaders,
                ...(options.headers || {}),
            },
        };

        try {
            const response = await fetch(url, config);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(
                    errorData.error?.message || 
                    errorData.message || 
                    `API request failed: ${response.status} ${response.statusText}`
                );
            }

            return await response.json();
        } catch (error) {
            console.error(`❌ API Error [${endpoint}]:`, error);
            throw error;
        }
    }

    /**
     * Save document sections to project
     * @param {string} projectId - The project ID
     * @param {Object|Array} sectionsPayload - Either a flat sections array (legacy)
     *                                        or a `{ [year]: Section[] }` map (new, year‑scoped)
     * @param {boolean} skipParentUpdate - If true, skip updating parent component (useful when modals are open)
     */
    async saveDocumentSections(projectId, sectionsPayload, skipParentUpdate = false) {
        if (!projectId) {
            throw new Error('Project ID is required');
        }

        const payload =
            sectionsPayload && typeof sectionsPayload === 'object'
                ? sectionsPayload
                : Array.isArray(sectionsPayload)
                    ? sectionsPayload
                    : [];

        try {
            const serialized = JSON.stringify(payload);
            const result = await window.DatabaseAPI.updateProject(projectId, {
                documentSections: serialized
            });

            // Update parent component's project prop if available and not skipping
            // Skip parent update when modals/forms are open to prevent them from closing
            if (!skipParentUpdate && window.updateViewingProject && typeof window.updateViewingProject === 'function') {
                const updatedProject = result?.data?.project || result?.project || result?.data;
                if (updatedProject) {
                    window.updateViewingProject({
                        ...updatedProject,
                        documentSections: serialized
                    });
                }
            }

            return result;
        } catch (error) {
            console.error('❌ Error saving document sections:', error);
            throw error;
        }
    }

    /**
     * Fetch fresh project data from database
     */
    async fetchProject(projectId) {
        if (!projectId) {
            throw new Error('Project ID is required');
        }

        try {
            const result = await window.DatabaseAPI.getProject(projectId);
            return result?.data?.project || result?.project || result?.data || result;
        } catch (error) {
            console.error('❌ Error fetching project:', error);
            throw error;
        }
    }

    /**
     * Get all document collection templates
     */
    async getTemplates() {
        try {
            const response = await this.request('/api/document-collection-templates', {
                method: 'GET',
            });

            return response.data?.templates || response.templates || [];
        } catch (error) {
            console.error('❌ Error fetching templates:', error);
            throw error;
        }
    }

    /**
     * Get single template by ID
     */
    async getTemplate(templateId) {
        if (!templateId) {
            throw new Error('Template ID is required');
        }

        try {
            const response = await this.request(`/api/document-collection-templates/${encodeURIComponent(templateId)}`, {
                method: 'GET',
            });

            return response.data?.template || response.template;
        } catch (error) {
            console.error('❌ Error fetching template:', error);
            throw error;
        }
    }

    /**
     * Create new template
     */
    async createTemplate(templateData) {
        if (!templateData || !templateData.name) {
            throw new Error('Template name is required');
        }

        try {
            const response = await this.request('/api/document-collection-templates', {
                method: 'POST',
                body: JSON.stringify({
                    name: templateData.name.trim(),
                    description: templateData.description || '',
                    sections: templateData.sections || [],
                    isDefault: templateData.isDefault === true,
                }),
            });

            return response.data?.template || response.template;
        } catch (error) {
            console.error('❌ Error creating template:', error);
            throw error;
        }
    }

    /**
     * Update existing template
     */
    async updateTemplate(templateId, templateData) {
        if (!templateId) {
            throw new Error('Template ID is required');
        }

        try {
            const response = await this.request(`/api/document-collection-templates/${encodeURIComponent(templateId)}`, {
                method: 'PUT',
                body: JSON.stringify({
                    name: templateData.name?.trim(),
                    description: templateData.description,
                    sections: templateData.sections,
                    isDefault: templateData.isDefault,
                }),
            });

            return response.data?.template || response.template;
        } catch (error) {
            console.error('❌ Error updating template:', error);
            throw error;
        }
    }

    /**
     * Delete template
     */
    async deleteTemplate(templateId) {
        if (!templateId) {
            throw new Error('Template ID is required');
        }

        try {
            await this.request(`/api/document-collection-templates/${encodeURIComponent(templateId)}`, {
                method: 'DELETE',
            });

            return true;
        } catch (error) {
            console.error('❌ Error deleting template:', error);
            throw error;
        }
    }
}

// Export singleton instance
if (typeof window !== 'undefined') {
    window.DocumentCollectionAPI = new DocumentCollectionAPI();
}

export default DocumentCollectionAPI;

