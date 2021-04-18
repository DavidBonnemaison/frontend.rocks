import React from 'react';

import Link from 'next/link';

import styles from './style.module.css';

const Navbar = () => (
  <ul className={styles.Menu}>
    <li className={styles['Menu-item']}>
      <Link href="/">
        <a className={styles['Menu-link']}>Blog</a>
      </Link>
    </li>
    <li className={styles['Menu-item']}>
      <Link href="/about/">
        <a className={styles['Menu-link']}>About</a>
      </Link>
    </li>
  </ul>
);

export default Navbar;
