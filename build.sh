for d in functions/* ; do
    echo "$d"
    cd $d 
    pwd
    npm i
    cd ../..
done

