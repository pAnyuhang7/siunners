import React from 'react';
import { createRoot } from 'react-dom/client';
import PetView from './PetView';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PetView />
  </React.StrictMode>
);
