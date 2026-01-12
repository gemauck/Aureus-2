/**
 * Mock Prisma client for testing
 */

export function createMockPrisma() {
  const mockData = {
    users: [],
    clients: [],
    projects: [],
    leads: [],
  };

  const mockPrisma = {
    user: {
      findUnique: jest.fn(({ where }) => {
        const user = mockData.users.find(u => {
          if (where.id) return u.id === where.id;
          if (where.email) return u.email === where.email;
          return false;
        });
        return Promise.resolve(user || null);
      }),
      findMany: jest.fn(() => Promise.resolve(mockData.users)),
      create: jest.fn(({ data }) => {
        const user = {
          id: `user-${Date.now()}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockData.users.push(user);
        return Promise.resolve(user);
      }),
      update: jest.fn(({ where, data }) => {
        const index = mockData.users.findIndex(u => {
          if (where.id) return u.id === where.id;
          if (where.email) return u.email === where.email;
          return false;
        });
        if (index === -1) return Promise.resolve(null);
        mockData.users[index] = { ...mockData.users[index], ...data };
        return Promise.resolve(mockData.users[index]);
      }),
      delete: jest.fn(({ where }) => {
        const index = mockData.users.findIndex(u => {
          if (where.id) return u.id === where.id;
          return false;
        });
        if (index === -1) return Promise.resolve(null);
        const user = mockData.users[index];
        mockData.users.splice(index, 1);
        return Promise.resolve(user);
      }),
    },
    client: {
      findUnique: jest.fn(({ where }) => {
        const client = mockData.clients.find(c => c.id === where.id);
        return Promise.resolve(client || null);
      }),
      findMany: jest.fn(() => Promise.resolve(mockData.clients)),
      create: jest.fn(({ data }) => {
        const client = {
          id: `client-${Date.now()}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockData.clients.push(client);
        return Promise.resolve(client);
      }),
      update: jest.fn(({ where, data }) => {
        const index = mockData.clients.findIndex(c => c.id === where.id);
        if (index === -1) return Promise.resolve(null);
        mockData.clients[index] = { ...mockData.clients[index], ...data };
        return Promise.resolve(mockData.clients[index]);
      }),
      delete: jest.fn(({ where }) => {
        const index = mockData.clients.findIndex(c => c.id === where.id);
        if (index === -1) return Promise.resolve(null);
        const client = mockData.clients[index];
        mockData.clients.splice(index, 1);
        return Promise.resolve(client);
      }),
    },
    project: {
      findUnique: jest.fn(({ where }) => {
        const project = mockData.projects.find(p => p.id === where.id);
        return Promise.resolve(project || null);
      }),
      findMany: jest.fn(() => Promise.resolve(mockData.projects)),
      create: jest.fn(({ data }) => {
        const project = {
          id: `project-${Date.now()}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockData.projects.push(project);
        return Promise.resolve(project);
      }),
      update: jest.fn(({ where, data }) => {
        const index = mockData.projects.findIndex(p => p.id === where.id);
        if (index === -1) return Promise.resolve(null);
        mockData.projects[index] = { ...mockData.projects[index], ...data };
        return Promise.resolve(mockData.projects[index]);
      }),
      delete: jest.fn(({ where }) => {
        const index = mockData.projects.findIndex(p => p.id === where.id);
        if (index === -1) return Promise.resolve(null);
        const project = mockData.projects[index];
        mockData.projects.splice(index, 1);
        return Promise.resolve(project);
      }),
    },
    $connect: jest.fn(() => Promise.resolve()),
    $disconnect: jest.fn(() => Promise.resolve()),
    $transaction: jest.fn((callback) => {
      if (typeof callback === 'function') {
        return callback(mockPrisma);
      }
      return Promise.resolve();
    }),
  };

  // Helper to reset mock data
  mockPrisma.reset = () => {
    mockData.users = [];
    mockData.clients = [];
    mockData.projects = [];
    mockData.leads = [];
    Object.values(mockPrisma).forEach((model) => {
      if (model && typeof model === 'object') {
        Object.keys(model).forEach((method) => {
          if (jest.isMockFunction(model[method])) {
            model[method].mockClear();
          }
        });
      }
    });
  };

  // Helper to seed test data
  mockPrisma.seed = {
    user: (userData) => {
      const user = {
        id: userData.id || `user-${Date.now()}`,
        email: userData.email,
        name: userData.name || 'Test User',
        passwordHash: userData.passwordHash || '$2a$10$dummyhash',
        role: userData.role || 'user',
        status: userData.status || 'active',
        mustChangePassword: userData.mustChangePassword || false,
        createdAt: userData.createdAt || new Date(),
        updatedAt: userData.updatedAt || new Date(),
      };
      mockData.users.push(user);
      return user;
    },
    client: (clientData) => {
      const client = {
        id: clientData.id || `client-${Date.now()}`,
        ...clientData,
        createdAt: clientData.createdAt || new Date(),
        updatedAt: clientData.updatedAt || new Date(),
      };
      mockData.clients.push(client);
      return client;
    },
    project: (projectData) => {
      const project = {
        id: projectData.id || `project-${Date.now()}`,
        ...projectData,
        createdAt: projectData.createdAt || new Date(),
        updatedAt: projectData.updatedAt || new Date(),
      };
      mockData.projects.push(project);
      return project;
    },
  };

  return mockPrisma;
}





