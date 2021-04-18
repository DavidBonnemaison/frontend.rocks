import React from 'react';

import { GetStaticProps } from 'next';

import { BlogGallery, BlogGalleryProps } from '../blog/BlogGallery';
import Layout from '../layout';
import Meta from '../layout/Meta';
import { PaginationProps } from '../pagination/Pagination';
import { Config } from '../utils/Config';
import { getAllPosts } from '../utils/Content';

const Index = (props: BlogGalleryProps) => (
  <Layout
    meta={
      <Meta title="Frontend Rocks - a frontend developer blog" description={Config.description} />
    }
  >
    <BlogGallery posts={props.posts} pagination={props.pagination} />
  </Layout>
);

export const getStaticProps: GetStaticProps<BlogGalleryProps> = async () => {
  const posts = getAllPosts(['title', 'date', 'slug']);
  const pagination: PaginationProps = {};

  if (posts.length > Config.pagination_size) {
    pagination.next = '/page2';
  }

  return {
    props: {
      posts: posts.slice(0, Config.pagination_size),
      pagination,
    },
  };
};

export default Index;
