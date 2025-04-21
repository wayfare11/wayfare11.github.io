---
title: 通过Jekyll Chirpy主题搭建Github Page博客
description: >-
  通过Jekyll Chirpy主题搭建Github Page博客的教程
author: wayfare11
date: 2025-04-21 16:00:00 +0800
categories: [博客]
tags: [搭建博客]
---

## 前言

Jekyll是一个静态网站生成器，可以将文本文件转换为静态网站，并提供一个模板系统，可以方便的管理网站内容。Jekyll Chirpy主题是一个基于Jekyll的博客主题，它提供了很多功能，比如文章分类、标签、评论、搜索、分页等。本文将介绍如何通过Jekyll Chirpy主题搭建Github Page博客。

## 准备工作

首先，你需要一个Github账号，并创建一个仓库，仓库名称必须为`username.github.io`，其中`username`为你的Github用户名。

### 使用模板

你可以直接使用[Jekyll Chirpy 主题](https://github.com/cotes2020/chirpy-starter)的模板直接搭建在自己的Github Page上，这里直接使用模板的方法，直接点击`Use this template`按钮，选择`create a new repository from template`，然后将仓库克隆到本地，将仓库名称改为`username.github.io`。

转到本地仓库，在`settings`页面，将`Github Pages`服务开启，选择`Pages`，`Sourece`选择 `Githup Pages`，保存设置。稍等片刻，你的博客就发布成功了。

### 修改主题

如果你想自己修改主题，将自己的仓库克隆到本地，修改`_config.yml`文件，然后运行提交修改，github page服务会自动更新博客内容。

#### 修改配置文件`_config.yml`

打开配置文件`_config.yml`，修改以下内容：

```yaml
# Site settings
title: Your Blog Name
email: your@email.com
description: >- # this means to ignore newlines until "baseurl:"
  Write an awesome description for your new site here. You can edit this
  line in _config.yml. It will appear in your document head meta (for
  Google search results) and in your feed.xml site description.
baseurl: "" # the subpath of your site, e.g. /blog
url: "https://yourusername.github.io" # the base hostname & protocol for your site, e.g. http://example.com
github_username: your_github_username
```

### 修改更多配置
除了修改配置文件`_config.yml`外，你还可以修改其他配置，此时，你需要将 [jekyll-theme-chirpy](https://github.com/cotes2020/jekyll-theme-chirpy)中的`_includes`、 `_data` 、`assets`等文件夹拷贝到克隆的本地仓库中，然后修改这些文件，提交修改，github page服务会自动更新博客内容。

## 写博客

博客文章一般放在`_posts`文件夹中，文件名格式为`YYYY-MM-DD-title.md`，其中`YYYY-MM-DD`为发布日期，`title`为文章标题，`.md`为文件后缀。

```yaml
---
title: Your Blog Title
categories: [Category1, Category2]
tags: [Tag1, Tag2]
pin: true # 置顶文章
toc: true # 目录
comments: true # 评论
---

# Your Blog Title

This is your first blog post.
```

文章内容写在`---`和`---`之间，`categories`和`tags`为文章分类和标签，`pin`为置顶文章，`toc`为目录，`comments`为评论。

## 写评论

Jekyll Chirpy主题提供了多种评论插件，比如[disqus | utterances | giscus]，这里我们使用giscus插件。

### 安装giscus插件
[Giscus](https://giscus.app/zh-CN) 是由 GitHub Discussions 驱动的评论系统。安装步骤参考 [Hugo 博客引入 Giscus 评论系统](https://www.lixueduan.com/posts/blog/02-add-giscus-comment/)

安装完成后，在发表的文章底部会出现一个评论框，点击`Reply`按钮，会打开一个新的页面，在`Category`下拉框选择`General`，在`Title`输入框输入你的评论标题，在`Message`输入框输入你的评论内容，点击`Submit`按钮即可。

## 其他

Jekyll Chirpy主题还有很多功能，比如文章搜索、分页、归档等，你可以根据自己的需求进行配置。