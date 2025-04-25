---
title: 使用lungmask实现自动分割肺部
description: >-
    介绍lungmask的用法，以及如何使用lungmask实现肺部自动分割。
author: wayfare11
date: 2025-04-25 17:00:00 +0800
categories: [医学影像处理, 图像分割, 肺部分割]
tags: [医学影像处理]
pin: false
---



# 使用 lungmask 自动分割肺部 CT 并保存掩膜

---

## 1. 环境安装

首先需要安装以下 Python 包：

- `lungmask`：肺部分割模型
- `SimpleITK`：医学图像读取
- `nibabel`：医学图像格式读写（如 NIfTI）
- `numpy`：基础数值计算

建议使用 `conda` 或 `pip` 安装：

```bash
pip install lungmask SimpleITK nibabel numpy
```

> ⚠️ 注意：`lungmask` 依赖 PyTorch，安装时会自动安装 CPU 版本的 torch。如果你有 GPU 并想加速，可以手动安装对应的 torch 版本。

## 2. 代码实现

下面是完整的分割及保存代码：

```python
import SimpleITK as sitk
import lungmask
import nibabel as nib
import numpy as np

if __name__ == '__main__':
    # 1. 读取 NIfTI 格式的 CT 图像
    nii = nib.load('./data/lung_001.nii.gz')
    img_sitk = sitk.ReadImage('./data/lung_001.nii.gz')
    
    # 2. 用 lungmask 进行肺部分割
    lung_mask = lungmask.mask.apply(img_sitk)
    # lungmask 输出的掩膜 shape 顺序为 (z, y, x)，需转置为 (x, y, z)
    lung_mask = np.transpose(lung_mask, (2, 1, 0))  
    
    # 3. 检查分割标签
    unique_labels = np.unique(lung_mask)
    print("标签值有：", unique_labels)
    # 通常 0=背景, 1=左肺, 2=右肺, 3=气管
    
    # 4. 合并所有非0标签为1，得到二值肺掩膜
    lung_mask_merged = (lung_mask > 0).astype(np.uint8)
    
    # 5. 保存为新的 NIfTI 文件，保持 affine 信息不变
    lung_mask_nii = nib.Nifti1Image(lung_mask_merged, affine=nii.affine)
    nib.save(lung_mask_nii, 'lung_001_lungmask_merged.nii.gz')
    print('合并后肺部分割结果已保存为 lung_001_lungmask_merged.nii.gz')
```

## 3. 代码说明

- **读取图像**  
  使用 `nibabel` 和 `SimpleITK` 读取同一个 CT 文件，分别用于后续分割和保存 affine 信息。

- **肺部自动分割**  
  `lungmask.mask.apply` 直接对 SimpleITK 图像进行分割，输出掩膜。

- **标签合并**  
  原始分割掩膜可能有多个标签（如左肺、右肺、气管等），这里将所有非0标签合并为1，得到二值化的肺掩膜。

- **保存掩膜**  
  用 `nibabel` 保存为 NIfTI 格式，保持原 affine 信息，方便后续配准和分析。

## 4. 结果说明

- `lung_001_lungmask_merged.nii.gz` 是最终的二值肺掩膜文件，肺部区域为1，其他为0。

- 控制台会输出掩膜中的唯一标签值，便于检查分割效果。

---

## 参考链接

- [lungmask GitHub](https://github.com/JoHof/lungmask)
- [nibabel 文档](https://nipy.org/nibabel/)
- [SimpleITK 文档](https://simpleitk.readthedocs.io/en/master/)

---

如有问题，欢迎随时补充或提问！