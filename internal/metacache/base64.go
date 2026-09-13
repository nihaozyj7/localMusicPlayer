package metacache

import "encoding/base64"

// base64Encode 单独包一层，方便以后换成流式编码而不动调用点。
func base64Encode(data []byte) string {
	return base64.StdEncoding.EncodeToString(data)
}
