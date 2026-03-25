package com.example.oral;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashMap;
import java.util.Map;

/**
 * 对接前端 Real Test：接收录音 + refText，调用腾讯云口语评测（新版）后返回结果。
 * 下一步：在此处接入腾讯云智聆口语评测（新版）Java SDK 或 WebSocket 签名逻辑。
 */
@RestController
public class OralEvalController {

    @PostMapping("/api/oral-eval")
    public ResponseEntity<Map<String, Object>> oralEval(
            @RequestParam("audio") MultipartFile audio,
            @RequestParam(value = "refText", defaultValue = "") String refText,
            @RequestParam(value = "evalMode", defaultValue = "0") String evalMode
    ) {
        Map<String, Object> body = new HashMap<>();
        if (audio.isEmpty()) {
            body.put("ok", false);
            body.put("error", "缺少音频文件 audio");
            return ResponseEntity.badRequest().body(body);
        }
        if (refText == null || refText.isBlank()) {
            body.put("ok", false);
            body.put("error", "缺少参考文本 refText");
            return ResponseEntity.badRequest().body(body);
        }

        // TODO: 1. 读取 audio.getBytes()；2. 调用腾讯云口语评测（新版）WebSocket/SDK；3. 解析得分与详情
        body.put("ok", true);
        body.put("overall", null);
        body.put("pronDetail", null);
        body.put("message", "Java 后端已收到请求，请在此处接入智聆口语评测（新版）SDK");

        return ResponseEntity.ok(body);
    }
}
