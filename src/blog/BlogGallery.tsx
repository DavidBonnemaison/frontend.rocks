import React from 'react';

import { format } from 'date-fns';
import Link from 'next/link';

import { Pagination, PaginationProps } from '../pagination/Pagination';
import { PostItems } from '../utils/Content';

export interface BlogGalleryProps {
  posts: PostItems[];
  pagination: PaginationProps;
}

const BlogGallery = (props: BlogGalleryProps) => (
  <>
    <ul>
      {props.posts.map((elt) => (
        <li key={elt.slug}>
          <Link href="/posts/[slug]" as={`/posts/${elt.slug}`}>
            <a>
              <h2>{elt.title}</h2>
            </a>
          </Link>

          <div>{format(new Date(elt.date), 'LLL d, yyyy')}</div>
        </li>
      ))}
    </ul>

    <Pagination previous={props.pagination.previous} next={props.pagination.next} />
  </>
);

export { BlogGallery };
