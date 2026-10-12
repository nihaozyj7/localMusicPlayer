package main

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"sync"

	"localmusicplayer/internal/bootstrap"
	"localmusicplayer/internal/packstore"
	"localmusicplayer/internal/skins"
	"localmusicplayer/internal/theme"
)

// PackService 是「从仓库获取主题 / 播放界面样式」的接口。
//
// 与 ThemeService / SkinService 的分工：那两个管的是**本机**已有的东西
// （列表、重扫、打开目录、导入本地文件夹、删除），本服务只管**从远端仓库取**。
// 装完之后仍然走它们重扫并读列表 —— 也就是说，从仓库装进来的主题与自己从
// 本地导入的主题在程序里没有任何区别，这样两条路径不会各坏各的。
//
// 远端数据源见 internal/packstore：<PackSource>/<kind>/index.json。
type PackService struct {
	store    *bootstrap.Store
	themeMgr *theme.Manager
	skinMgr  *skins.Manager

	// mu 保护下面这对字段：client 只会因为「地址变了」而重建。
	//
	// 为什么不是每次调用现建一个 client：client 里带着一份内存缓存
	// （用来让「切换 tab 来回看」不反复打 GitHub）。每次新建就等于没有缓存，
	// 而且一点开面板就是两三次网络请求。
	mu           sync.Mutex
	client       *packstore.Client
	clientSource string
	clientChan   string
}

// NewPackService 构造服务。
func NewPackService(store *bootstrap.Store, themeMgr *theme.Manager, skinMgr *skins.Manager) *PackService {
	return &PackService{store: store, themeMgr: themeMgr, skinMgr: skinMgr}
}

// clientFor 取当前配置对应的下载器；地址或通道变了就重建。
func (s *PackService) clientFor() *packstore.Client {
	cfg := s.store.Get()
	source := bootstrap.NormalizePackSource(cfg.PackSource)
	channel := bootstrap.NormalizeUpdateChannel(cfg.UpdateChannel)

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.client != nil && s.clientSource == source && s.clientChan == channel {
		return s.client
	}
	c := packstore.NewClient(source, channel, filepath.Join(cfg.CacheDir, "packstore"))
	c.UserAgent = "LMPlayer/" + appVersion + " (+https://github.com/nihaozyj7/localMusicPlayer)"
	s.client, s.clientSource, s.clientChan = c, source, channel
	return c
}

// Source 返回当前的插件仓库地址、默认地址与当前下载通道。
//
// 界面要用它显示「现在从哪儿取」并提供「恢复默认」。通道直接复用更新的
// 那一项设置：两者面对的是同一件事实 —— GitHub 在这台机器上能不能直连。
func (s *PackService) Source() map[string]any {
	cfg := s.store.Get()
	return map[string]any{
		"source":  bootstrap.NormalizePackSource(cfg.PackSource),
		"default": bootstrap.DefaultPackSource,
		"channel": bootstrap.NormalizeUpdateChannel(cfg.UpdateChannel),
		// problem 非空表示「用户填的地址不会被使用」（已落回默认地址）。
		// 面板必须显示出来：不显示的话，用户看到的现象是「改完地址、刷新一下
		// 又变回默认了」，只会以为是自己没保存成功。规则只有一份，在 bootstrap
		//（PackSourceProblem），前端不重复实现。
		"problem": bootstrap.PackSourceProblem(cfg.PackSource),
	}
}

// SetSource 修改插件仓库地址（规范化后落盘，空值落回默认地址）。
func (s *PackService) SetSource(url string) (map[string]any, error) {
	if s == nil || s.store == nil {
		return nil, fmt.Errorf("插件服务未就绪")
	}
	clean := bootstrap.NormalizePackSource(url)
	if err := s.store.Update(func(c *bootstrap.Config) { c.PackSource = clean }); err != nil {
		return nil, err
	}
	return s.Source(), nil
}

// Catalog 取远端清单。
//
// refresh=true 表示「用户点了刷新」，绕过内存缓存；否则 3 分钟内的结果直接复用。
// 联网失败但本机有上次的缓存时**不报错**，而是返回 Cached=true + StaleReason ——
// 对国内网络来说「GitHub 打不开」是常态，这时能列出上次看到的清单比一片空白有用。
func (s *PackService) Catalog(kind string, refresh bool) (packstore.CatalogResult, error) {
	if s == nil || s.store == nil {
		return packstore.CatalogResult{}, fmt.Errorf("插件服务未就绪")
	}
	return s.clientFor().Catalog(context.Background(), strings.TrimSpace(kind), refresh)
}

// Install 下载并安装仓库里的一个条目。
//
// 返回 { kind, id, files, bytes, backups, channel }；装完立刻重扫对应的管理器，
// 前端拿到结果后重新读一次列表就能看到新条目。
func (s *PackService) Install(kind, id string) (map[string]any, error) {
	if s == nil || s.store == nil {
		return nil, fmt.Errorf("插件服务未就绪")
	}
	kind = strings.TrimSpace(kind)
	id = strings.TrimSpace(id)

	client := s.clientFor()
	// 这里用 refresh=false：用户是**看着刚才那份列表**点的安装，
	// 重新拉一次不仅多一次请求，还可能拉到一份刚好变了样、连 id 都对不上的清单。
	cat, err := client.Catalog(context.Background(), kind, false)
	if err != nil {
		return nil, err
	}
	item, ok := findPackItem(cat.Items, id)
	if !ok {
		return nil, fmt.Errorf("仓库里没有「%s」，请先刷新列表", id)
	}

	target, mgr, err := s.targetFor(kind, item)
	if err != nil {
		return nil, err
	}
	res, err := client.Install(context.Background(), kind, item, target)
	if err != nil {
		return nil, err
	}
	// 重扫失败不回滚安装结果：文件已经正确落盘了，重扫只是「让程序现在就看到它」，
	// 报成失败会让用户以为没装上而反复重装。
	if mgr != nil {
		_ = mgr()
	}
	return map[string]any{
		"kind":    kind,
		"id":      res.ID,
		"name":    item.Name,
		"version": item.Version,
		"files":   res.Files,
		"bytes":   res.Bytes,
		"backups": res.Backups,
		"channel": res.Channel,
	}, nil
}

// targetFor 算出安装落点，并返回一个「装完重扫」的闭包。
func (s *PackService) targetFor(kind string, item packstore.Item) (packstore.Target, func() error, error) {
	switch kind {
	case packstore.KindTheme:
		if s.themeMgr == nil {
			return packstore.Target{}, nil, fmt.Errorf("主题服务未就绪")
		}
		return packstore.Target{Dir: s.themeMgr.Dir()}, s.themeMgr.Reload, nil

	case packstore.KindStyle:
		if s.skinMgr == nil {
			return packstore.Target{}, nil, fmt.Errorf("样式服务未就绪")
		}
		// 清单里每个文件的路径都带包目录前缀（生成脚本按**目录名**加前缀），
		// 所以要按目录名对齐：dir 字段缺失时（手写的清单）退回 id。
		dir := strings.TrimSpace(item.Dir)
		if dir == "" {
			dir = item.ID
		}
		return packstore.Target{
			Dir:    filepath.Join(s.skinMgr.Dir(), dir),
			Prefix: dir + "/",
		}, s.skinMgr.Reload, nil

	default:
		return packstore.Target{}, nil, fmt.Errorf("未知的插件类型：%q", kind)
	}
}

func findPackItem(items []packstore.Item, id string) (packstore.Item, bool) {
	for _, it := range items {
		if it.ID == id {
			return it, true
		}
	}
	return packstore.Item{}, false
}
