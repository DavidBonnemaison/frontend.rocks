import React from 'react';

import { format } from 'date-fns';
import { GetStaticPaths, GetStaticProps } from 'next';

import Content from '../../content';
import Layout from '../../layout';
import Meta from '../../layout/Meta';
import { getAllPosts, getPostBySlug } from '../../utils/Content';
import { markdownToHtml } from '../../utils/Markdown';

import 'prismjs/themes/prism-okaidia.css';

type PostUrl = {
  slug: string;
};

interface PostProps {
  title: string;
  description: string;
  date: string;
  modified_date: string;
  image: string;
  content: string;
}

const DisplayPost = (props: PostProps) => (
  <Layout
    meta={(
      <Meta
        title={props.title}
        description={props.description}
        post={{
          image: props.image,
          date: props.date,
          modified_date: props.modified_date,
        }}
      />
    )}
  >
    <Content>
      <h1>{props.title}</h1>
      <div>{format(new Date(props.date), 'LLLL d, yyyy')}</div>
      <div
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: props.content }}
      />
    </Content>
  </Layout>
);

export const getStaticPaths: GetStaticPaths<PostUrl> = async () => {
  const posts = getAllPosts(['slug']);

  return {
    paths: posts.map((post) => ({
      params: {
        slug: post.slug,
      },
    })),
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps<PostProps, PostUrl> = async ({ params }) => {
  const post = getPostBySlug(params!.slug, [
    'title',
    'description',
    'date',
    'modified_date',
    'image',
    'content',
    'slug',
  ]);
  const content = await markdownToHtml(post.content || '');

  return {
    props: {
      title: post.title,
      description: post.description,
      date: post.date,
      modified_date: post.modified_date,
      image: post.image,
      content,
    },
  };
};

export default DisplayPost;
