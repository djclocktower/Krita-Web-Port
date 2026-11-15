import { store } from './store';

/** The message shown in the shell's dismissible error banner. Panels may import `reportError` to use it. */
export const errors = store({ message: '' });
export const reportError = (message: string) => errors.set({ message });
