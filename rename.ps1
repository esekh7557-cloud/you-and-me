$files = Get-ChildItem -Filter *.html
foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    $content = $content -replace 'href="menu\.html"', 'href="order.html"'
    $content = $content -replace '>Menu<', '>Order<'
    $content = $content -replace 'Explore Menu', 'Build Your Order'
    $content = $content -replace 'View Menu', 'Order Now'
    $content = $content -replace '<title>Menu \|', '<title>Order |'
    $content = $content -replace 'Explore Our Menu', 'Build Your Order'
    $content = $content -replace 'Search the menu', 'Search to order'
    Set-Content -Path $file.FullName -Value $content -NoNewline
}
