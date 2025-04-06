let devMode = import.meta.env.DEV || false;
let configDevMode = false;

export const setDevMode = (value) => {
  devMode = !!value;
};

export const setConfigDevMode = (value) => {
  configDevMode = !!value;
};

export const isDevMode = () => devMode || configDevMode;