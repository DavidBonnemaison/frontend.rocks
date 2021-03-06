import React from 'react';

import { GetStaticPaths, GetStaticProps } from 'next';

import { BlogGallery, BlogGalleryProps } from '../blog/BlogGallery';
import Layout from '../layout';
import Meta from '../layout/Meta';
import { PaginationProps } from '../pagination/Pagination';
import { Config } from '../utils/Config';
import { getAllPosts } from '../utils/Content';
import { convertTo2D } from '../utils/Pagination';

type PageUrl = {
  page: string;
};

const PaginatePosts = (props: BlogGalleryProps) => (
  <Layout meta={<Meta title="Lorem ipsum" description="Lorem ipsum" />}>
    <BlogGallery posts={props.posts} pagination={props.pagination} />
  </Layout>
);

export const getStaticPaths: GetStaticPaths<PageUrl> = async () => {
  const posts = getAllPosts(['slug']);

  const pages = convertTo2D(posts, Config.pagination_size);

  return {
    paths: pages.slice(1).map((_, ind) => ({
      params: {
        // Ind starts from zero so we need to do ind + 1
        // slice(1) removes the first page so we do another ind + 1
        // the first page is implemented in index.tsx
        page: `page${ind + 2}`,
      },
    })),
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps<BlogGalleryProps, PageUrl> = async ({ params }) => {
  const posts = getAllPosts(['title', 'date', 'slug']);

  const pages = convertTo2D(posts, Config.pagination_size);
  const currentPage = Number(params!.page.replace('page', ''));
  const currentInd = currentPage - 1;

  const pagination: PaginationProps = {};

  if (currentPage < pages.length) {
    pagination.next = `page${currentPage + 1}`;
  }

  if (currentPage === 2) {
    pagination.previous = '/';
  } else {
    pagination.previous = `page${currentPage - 1}`;
  }

  return {
    props: {
      posts: pages[currentInd],
      pagination,
    },
  };
};

export default PaginatePosts;
