import React, { ReactNode } from 'react';

import styles from './style.module.css';

interface ContentProps {
  children: ReactNode;
}

const Content = (props: ContentProps) => <main className={styles.Main}>{props.children}</main>;

export default Content;
