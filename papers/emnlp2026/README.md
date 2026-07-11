# EMNLP 2026 论文投稿模板

EMNLP 2026 使用 ACL 官方样式文件（与 ACL、NAACL 等 *ACL 会议相同）。

来源：[acl-org/acl-style-files](https://github.com/acl-org/acl-style-files)（2026-06-29 下载）

## 会议信息

| 项目 | 说明 |
| --- | --- |
| 会议 | EMNLP 2026，布达佩斯，2026-10-24 至 10-29 |
| 投稿通道 | [ACL Rolling Review (ARR)](https://aclrollingreview.org/) |
| ARR 截稿 | 2026-05-25 |
| Long paper | 正文 8 页 + 不限参考文献 |
| Short paper | 正文 4 页 + 不限参考文献 |
| 必含章节 | Limitations（不计入页数） |

## 文件说明

| 文件 | 用途 |
| --- | --- |
| `acl_latex.tex` | **主模板**（pdfLaTeX），以此文件为起点撰写论文 |
| `acl_lualatex.tex` | XeLaTeX / LuaLaTeX 模板 |
| `acl.sty` | ACL 样式包 |
| `acl_natbib.bst` | 参考文献样式 |
| `custom.bib` | 示例 BibTeX |
| `formatting.md` | 官方排版说明（英文） |

## 快速开始

1. 复制 `acl_latex.tex` 为你的主文件（或直接编辑该文件）。
2. 投稿审稿版保持 `\usepackage[review]{acl}`（匿名、无页码）。
3. 录用后改为 `\usepackage[final]{acl}`。
4. 用 pdfLaTeX 编译：

```bash
pdflatex acl_latex.tex
bibtex acl_latex
pdflatex acl_latex.tex
pdflatex acl_latex.tex
```

也可在 [Overleaf ACL 模板](https://www.overleaf.com/latex/templates/association-for-computational-linguistics-acl-conference/jvxskxpnznfj) 在线编辑。

## 官方文档

- [Paper formatting guidelines](https://acl-org.github.io/ACLPUB/formatting.html)
- [ACL style files 仓库](https://github.com/acl-org/acl-style-files)
