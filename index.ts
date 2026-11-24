import { registerRootComponent } from 'expo';
// Imported first so the background task is defined before the OS can invoke it.
import './src/services/background';
import App from './App';

registerRootComponent(App);
