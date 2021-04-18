import React from 'react';

import Link from 'next/link';

import Navbar from '../../navigation/Navbar';
import { Config } from '../../utils/Config';
import styles from './style.module.css';

const Header = () => (
  <header className={styles.Header}>
    <div className={styles['Header-container']}>
      <Link href="/">
        <div className={styles.Logo}>
          <div className={styles['Logo-title']}>{Config.title}</div>
          <div>{Config.description}</div>
        </div>
      </Link>
      <Navbar />
    </div>
  </header>
);

export default Header;
