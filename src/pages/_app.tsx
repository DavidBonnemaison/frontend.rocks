import React from 'react';

import { AppProps } from 'next/app';

import './main.css';

// eslint-disable-next-line react/jsx-props-no-spreading
const App = ({ Component, pageProps }: AppProps) => <Component {...pageProps} />;

export default App;
