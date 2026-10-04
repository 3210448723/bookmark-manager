/**
 * 应用级偏好设置。偏好与书签数据分开，避免导入、重置书签时影响用户界面选择。
 */
const getInitialTheme = () => {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem('bookmark-manager-theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const state = {
  theme: getInitialTheme()
};

const mutations = {
  SET_THEME(moduleState, theme) {
    moduleState.theme = theme === 'dark' ? 'dark' : 'light';
    if (typeof window !== 'undefined') window.localStorage.setItem('bookmark-manager-theme', moduleState.theme);
  }
};

const actions = {
  setTheme({ commit }, theme) {
    commit('SET_THEME', theme);
    return Promise.resolve(theme === 'dark' ? 'dark' : 'light');
  },
  toggleTheme({ state: moduleState, commit }) {
    const theme = moduleState.theme === 'dark' ? 'light' : 'dark';
    commit('SET_THEME', theme);
    return Promise.resolve(theme);
  }
};

export default { namespaced: true, state, mutations, actions };
