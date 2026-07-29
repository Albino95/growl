import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import { AdminAuthProvider } from './auth/AdminAuthProvider';
import { SellerAuthProvider } from './auth/SellerAuthProvider';
import { router } from './app/router';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminAuthProvider>
      <SellerAuthProvider>
        <RouterProvider router={router} />
      </SellerAuthProvider>
    </AdminAuthProvider>
  </StrictMode>
);
