// Swap provider here -- only this line changes when switching backends.
export { nhostBackend as backend } from './nhost';
// Future: export { firebaseBackend as backend } from './firebase';

export type { AppSession, BackendProvider } from './types';
