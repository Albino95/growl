import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
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
