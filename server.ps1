$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8085/")
$listener.Start()
Write-Host "Server listening at http://localhost:8085/"

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $filePath = "C:\Users\kh28\.gemini\antigravity\scratch\san-marcos-tubing-dashboard\index.html"
        if (Test-Path $filePath) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentType = "text/html; charset=utf-8"
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
        }
        $response.Close()
    } catch {
        # continue loop
    }
}
