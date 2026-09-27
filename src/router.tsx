import { createBrowserRouter } from 'react-router'
import IndexPage from '@/pages/index'

/** Every route of the application. `App` mounts the router below the header. */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <IndexPage />,
  },
])
