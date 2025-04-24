---
title: 用Otsu阈值与形态学方法实现分割医学CT中的肺部
description: >-
  本教程介绍如何用Otsu阈值与形态学方法实现分割医学CT中的肺部。本方法无需深度学习，完全基于传统图像处理算法，可自动获得三维肺部掩码，适合医学影像处理初学者和进阶用户。
author: wayfare11
date: 2025-04-24 08:00:00 +0800
categories: [医学影像处理]
tags: [图像分割、医学影像处理]
pin: true
---

# 用Otsu阈值与形态学方法实现分割医学CT中的肺部

---

## 目录

1. [简介](#简介)
2. [环境准备](#环境准备)
3. [方法原理](#方法原理)
4. [完整代码与流程讲解](#完整代码与流程讲解)
    - [4.1 CT窗函数调整](#41-ct窗函数调整)
    - [4.2 逐层Otsu二值化](#42-逐层otsu二值化)
    - [4.3 去除与背景连通的区域](#43-去除与背景连通的区域)
    - [4.4 去除小连通域](#44-去除小连通域)
    - [4.5 洞填充](#45-洞填充)
    - [4.6 闭操作修复边缘](#46-闭操作修复边缘)
    - [4.7 3D连通域分析](#47-3d连通域分析)
    - [4.8 主流程与可视化](#48-主流程与可视化)
5. [运行与结果](#运行与结果)
6. [总结](#总结)
7. [参考资料](#参考资料)

---

## 简介

本教程介绍如何**用Otsu阈值与形态学方法实现分割医学CT中的肺部**。本方法无需深度学习，完全基于传统图像处理算法，可自动获得三维肺部掩码，适合医学影像处理初学者和进阶用户。
源码及数据可在[GitHub]()获取。

---

## 环境准备

请确保安装如下Python库：

```bash
pip install numpy opencv-python nibabel matplotlib scipy
```

---

## 方法原理

本方法主要包含以下步骤：

- **窗宽窗位调整**：将CT值归一化到合适的灰度范围（肺窗）
- **Otsu阈值分割**：自动分割肺部与其他组织
- **去除背景和小连通域**：只保留肺部结构
- **洞填充与形态学闭操作**：修复掩码边缘
- **三维连通域分析**：自适应保留最大两个肺部区域

---

## 完整代码与流程讲解

### 4.1 CT窗函数调整

```python
def ct_window(img, WL=-600, WW=1500):
    img = np.clip(img, WL - WW // 2, WL + WW // 2)
    img = (img - (WL - WW // 2)) / WW * 255.0
    return img.astype(np.uint8)
```
**作用**：将CT原始值（HU值）通过窗宽窗位调整到适合显示和处理的灰度范围。肺窗常用参数：`WL=-600, WW=1500`。

---

### 4.2 逐层Otsu二值化

```python
def otsu_3d(img_3d):
    binary_3d = np.zeros_like(img_3d, dtype=np.uint8)
    for i in range(img_3d.shape[2]):
        _, binary_3d[:, :, i] = cv2.threshold(img_3d[:, :, i], 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return binary_3d
```
**作用**：对每一层切片使用Otsu算法自动阈值分割，得到初步的二值掩码。

---

### 4.3 去除与背景连通的区域

```python
def remove_background_2d(binary_3d):
    out = np.zeros_like(binary_3d, dtype=np.uint8)
    for i in range(binary_3d.shape[2]):
        binary_slice = binary_3d[:, :, i]
        ex = cv2.copyMakeBorder(binary_slice, 3, 3, 3, 3, cv2.BORDER_CONSTANT, value=0)
        cv2.floodFill(ex, None, (0, 0), 255)
        mask = ex == 0
        result = np.zeros_like(binary_slice)
        result[mask[3:-3, 3:-3]] = 255
        out[:, :, i] = result
    return out
```
**作用**：去除与图像边缘（背景）连通的区域，只保留肺部等内部结构。

---

### 4.4 去除小连通域

```python
def remove_small_objects(mask, min_area=1000):
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    out = np.zeros_like(mask)
    for i in range(1, num_labels):  # 0是背景
        area = stats[i, cv2.CC_STAT_AREA]
        if area >= min_area:
            out[labels == i] = 255
    return out
```
**作用**：去除面积较小的连通区域（如噪声），只保留较大的结构（肺部）。

---

### 4.5 洞填充

```python
from scipy.ndimage import binary_fill_holes

def fill_holes_3d(mask_3d):
    filled = np.zeros_like(mask_3d)
    for i in range(mask_3d.shape[2]):
        filled[:, :, i] = binary_fill_holes(mask_3d[:, :, i] > 0).astype(np.uint8) * 255
    return filled
```
**作用**：填补掩码内部的空洞，确保肺部区域完整。

---

### 4.6 闭操作修复边缘

```python
def morph_close_3d(mask_3d, kernel_size=5):
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    closed = np.zeros_like(mask_3d)
    for i in range(mask_3d.shape[2]):
        closed[:, :, i] = cv2.morphologyEx(mask_3d[:, :, i], cv2.MORPH_CLOSE, kernel)
    return closed
```
**作用**：平滑边缘，去除小孔和断裂。

---

### 4.7 3D连通域分析

```python
from scipy.ndimage import label

def keep_largest_objects_adaptive(mask_3d, area_ratio_thresh=5.0):
    labeled, num = label(mask_3d > 0)
    if num <= 2:
        return (mask_3d > 0).astype(np.uint8) * 255
    counts = np.bincount(labeled.flat)
    areas = counts[1:]  # counts[0]是背景
    if len(areas) < 2:
        mask = (labeled > 0)
        return (mask * 255).astype(np.uint8)
    sorted_idx = np.argsort(areas)[::-1]
    area1, area2 = areas[sorted_idx[0]], areas[sorted_idx[1]]
    label1, label2 = sorted_idx[0]+1, sorted_idx[1]+1
    if area1 > area_ratio_thresh * area2:
        mask = (labeled == label1)
    else:
        mask = np.isin(labeled, [label1, label2])
    return (mask * 255).astype(np.uint8)
```
**作用**：在三维上只保留最大的1-2个连通区域（通常为左右肺），自适应处理连在一起的情况。

---

### 4.8 主流程与可视化

```python
import nibabel as nib
import numpy as np
import cv2
import matplotlib.pyplot as plt

def lung_mask_pipeline(nii_path, out_path):
    # 读取CT
    nii = nib.load(nii_path)
    img_3d = nii.get_fdata()
    img_3d = ct_window(img_3d)

    # 逐步处理
    binary_3d = otsu_3d(img_3d)
    binary_3d_no_bg = remove_background_2d(binary_3d)
    min_area = 1000
    clean_3d = np.zeros_like(binary_3d_no_bg, dtype=np.uint8)
    for i in range(binary_3d_no_bg.shape[2]):
        clean_3d[:, :, i] = remove_small_objects(binary_3d_no_bg[:, :, i], min_area=min_area)
    filled_3d = fill_holes_3d(clean_3d)
    closed_3d = morph_close_3d(filled_3d, kernel_size=5)
    lung_mask_3d = keep_largest_objects_adaptive(closed_3d)

    # 保存NIfTI掩码
    final_nii = nib.Nifti1Image(lung_mask_3d, affine=nii.affine, header=nii.header)
    nib.save(final_nii, out_path)
    print(f'最终3D二值化肺掩码已保存为 {out_path}')

    # 可视化
    slice_id = img_3d.shape[2] // 2
    plt.figure(figsize=(24, 4))
    plt.subplot(1, 6, 1)
    plt.title('Original CT (windowed)')
    plt.imshow(img_3d[:, :, slice_id], cmap='gray')
    plt.axis('off')
    plt.subplot(1, 6, 2)
    plt.title('Otsu Binary')
    plt.imshow(binary_3d[:, :, slice_id], cmap='gray')
    plt.axis('off')
    plt.subplot(1, 6, 3)
    plt.title('No Background')
    plt.imshow(binary_3d_no_bg[:, :, slice_id], cmap='gray')
    plt.axis('off')
    plt.subplot(1, 6, 4)
    plt.title('Hole Filled')
    plt.imshow(filled_3d[:, :, slice_id], cmap='gray')
    plt.axis('off')
    plt.subplot(1, 6, 5)
    plt.title('Morph Close')
    plt.imshow(closed_3d[:, :, slice_id], cmap='gray')
    plt.axis('off')
    plt.subplot(1, 6, 6)
    plt.title('3D Largest 2')
    plt.imshow(lung_mask_3d[:, :, slice_id], cmap='gray')
    plt.axis('off')
    plt.tight_layout()
    plt.show()
```

---

## 运行与结果

### 输入与输出

- **输入**：三维CT影像（NIfTI格式，`.nii`或`.nii.gz`）
- **输出**：三维肺掩码（NIfTI格式，`lung_mask_final.nii.gz`）

### 运行示例

```python
lung_mask_pipeline('your_ct.nii.gz', 'lung_mask_final.nii.gz')
```

处理过程会自动显示每一步的中间结果，直观展示肺部分割效果。

---

## 总结

本教程完整演示了**用Otsu阈值与形态学方法实现分割医学CT中的肺部**的全流程。该方法无需训练模型，适合快速肺部ROI提取，也可作为深度学习分割的预处理。你可以根据实际需求调整参数（如`min_area`、`kernel_size`、窗宽窗位等）。

---

## 参考资料

- [Otsu阈值法](https://en.wikipedia.org/wiki/Otsu%27s_method)
- [OpenCV形态学操作](https://docs.opencv.org/master/d9/d61/tutorial_py_morphological_ops.html)
- [nibabel官方文档](https://nipy.org/nibabel/)
- [Scipy.ndimage文档](https://docs.scipy.org/doc/scipy/reference/ndimage.html)

---

如需分割其他医学结构，只需调整阈值与区域筛选条件即可。  
如有问题欢迎随时提问！

---