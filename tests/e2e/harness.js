export async function installRandomChatHarness(page, overrides = {}) {
  await page.addInitScript((overrides) => {
    window.videowhisperConfig = {
      ...overrides,
      view: overrides.view || 'RandomChat',
      username: 'E2EUser',
      channel: 'E2ERoom',
      randomChat: {
        queue: 'e2e',
        collapseAfterMs: 600000,
        filters: [
          {
            label: 'Topic',
            key: 'topic',
            options: ['Support', 'Sales'],
          },
          {
            label: 'Language',
            key: 'language',
            options: ['English', 'Romanian'],
          },
        ],
      },
    };

    window.__videowhisperE2E = {
      sockets: [],
      events: [],
    };

    class E2ESocket {
      constructor() {
        this.id = 'socket-e2e';
        this.connected = false;
        this.listeners = {};
        this.io = {
          engine: {
            transport: {
              name: 'websocket',
            },
          },
        };
      }

      on(event, handler) {
        this.listeners[event] = this.listeners[event] || new Set();
        this.listeners[event].add(handler);
        return this;
      }

      off(event, handler) {
        if (!this.listeners[event]) return this;
        if (handler) {
          this.listeners[event].delete(handler);
        } else {
          this.listeners[event].clear();
        }
        return this;
      }

      emit(event, payload) {
        window.__videowhisperE2E.events.push({ event, payload });
        return this;
      }

      connect() {
        this.connected = true;
        window.setTimeout(() => {
          this.trigger('connect');
        }, 0);
        return this;
      }

      disconnect() {
        this.connected = false;
        this.trigger('disconnect', 'io client disconnect');
        return this;
      }

      trigger(event, payload) {
        for (const handler of this.listeners[event] || []) {
          handler(payload);
        }
      }
    }

    window.__videowhisperSocketFactory = (_url, options) => {
      const socket = new E2ESocket();
      socket.auth = options.auth;
      window.__videowhisperE2E.sockets.push(socket);
      window.__videowhisperE2E.socket = socket;
      return socket;
    };

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices: async () => [
          {
            kind: 'videoinput',
            deviceId: 'camera-e2e',
            label: 'E2E Camera',
          },
        ],
        getUserMedia: async (constraints) => { window.__videowhisperE2E.captures = [...(window.__videowhisperE2E.captures || []), constraints]; return new MediaStream(); },
        getDisplayMedia: async () => new MediaStream(),
      },
    });
  }, overrides);
}

