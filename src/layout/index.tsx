import React, { ReactNode } from 'react';

import Header from './Header';

interface LayoutProps {
  meta: ReactNode;
  children: ReactNode;
}

const Layout = (props: LayoutProps) => (
  <>
    {props.meta}
    <Header />
    {props.children}
    <footer>Footer</footer>
  </>
);

export default Layout;
